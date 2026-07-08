import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool';
import { requireAuth, requireAdmin, requireHR } from '../middleware/auth';
import { workdaysBetween, refreshHolidayCache } from '../utils/holidays';
import { classifyDay, leaveCountsAsCheckIn, leaveCountsAsCheckOut, leaveCountsAsNote } from '../utils/attendanceKpi';
import { generateRandomCheckSlotsForUser } from '../jobs/scheduler';
import jwt from 'jsonwebtoken';
import { buildIndividualReport } from '../services/reportBuilder';
import { sendReportLink } from '../services/reportSender';

const router = Router();
router.use(requireAuth, requireAdmin);

// 직원 신규 등록/재활성화 시 당일 남은 랜덤 확인 슬롯을 생성한다(실패해도 등록은 진행).
async function generateTodaySlots(
  userId: string, scheduledStart?: string, scheduledEnd?: string, lunchStart?: string, lunchEnd?: string,
): Promise<void> {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    await generateRandomCheckSlotsForUser(
      {
        id: userId,
        scheduled_start: scheduledStart || '09:00',
        scheduled_end: scheduledEnd || '18:00',
        lunch_start: lunchStart || '12:00',
        lunch_end: lunchEnd || '13:00',
      },
      today,
      true, // 이미 지난 시각은 제외
    );
  } catch (err: any) {
    console.error(`[랜덤체크 당일생성 실패] user=${userId}:`, err.message);
  }
}

// ── 근무지(Workplaces) CRUD ─────────────────────────────────────

// 카카오 로컬 API: 주소 → 좌표
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; road: string; zone: string } | null> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key || !address) return null;
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const resp = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error('[카카오 지오코딩 오류]', resp.status, body);
    throw new Error(`카카오 API 오류 (${resp.status})${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  const data: any = await resp.json();
  const doc = data.documents?.[0];
  if (!doc) return null;
  return {
    lat: parseFloat(doc.y), lng: parseFloat(doc.x),
    road: doc.road_address?.address_name || doc.address_name || address,
    zone: doc.road_address?.zone_no || '',
  };
}

router.get('/geocode', async (req: Request, res: Response): Promise<void> => {
  const address = (req.query.address as string) || '';
  if (!address) { res.status(400).json({ error: '주소가 필요합니다.' }); return; }
  if (!process.env.KAKAO_REST_KEY) { res.status(500).json({ error: '카카오 API 키가 설정되지 않았습니다.' }); return; }
  try {
    const g = await geocodeAddress(address);
    if (!g) { res.status(404).json({ error: '주소를 찾을 수 없습니다.' }); return; }
    res.json(g);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/workplaces', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'SELECT id, name, lat, lng, radius_m, address, postal_code, detail_address, is_active, created_at FROM workplaces WHERE is_active=TRUE ORDER BY name'
  );
  res.json({ workplaces: rows });
});

// 근무지명/주소 중복 검사 (활성 근무지 대상). excludeId는 수정 시 자기 자신 제외.
async function workplaceDupCheck(name: string, address: string, excludeId?: string): Promise<{ name: boolean; address: boolean }> {
  const { rows } = await pool.query(
    `SELECT name, address FROM workplaces WHERE is_active=TRUE ${excludeId ? 'AND id<>$3' : ''}
       AND (name=$1 OR (address IS NOT NULL AND address=$2))`,
    excludeId ? [name, address || '', excludeId] : [name, address || '']
  );
  return { name: rows.some((r: any) => r.name === name), address: !!address && rows.some((r: any) => r.address === address) };
}

router.post('/workplaces', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, lat, lng, radiusM, address, postalCode, detailAddress } = req.body;
  if (!name || lat == null || lng == null) { res.status(400).json({ error: 'name, lat, lng는 필수입니다.' }); return; }
  const dup = await workplaceDupCheck(name, address);
  if (dup.name || dup.address) { res.status(409).json({ error: '중복', dup }); return; }
  const { rows } = await pool.query(
    'INSERT INTO workplaces (name, lat, lng, radius_m, address, postal_code, detail_address) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, lat, lng, radiusM || 300, address || null, postalCode || null, detailAddress || null]
  );
  res.status(201).json({ workplace: rows[0] });
});

router.put('/workplaces/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, lat, lng, radiusM, address, postalCode, detailAddress } = req.body;
  const dup = await workplaceDupCheck(name, address, req.params.id);
  if (dup.name || dup.address) { res.status(409).json({ error: '중복', dup }); return; }
  const { rows } = await pool.query(
    'UPDATE workplaces SET name=$1, lat=$2, lng=$3, radius_m=$4, address=$5, postal_code=$6, detail_address=$7 WHERE id=$8 RETURNING *',
    [name, lat, lng, radiusM || 300, address || null, postalCode || null, detailAddress || null, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '근무지를 찾을 수 없습니다.' }); return; }
  res.json({ workplace: rows[0] });
});

router.delete('/workplaces/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('UPDATE workplaces SET is_active=FALSE WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// 근무지 일괄 등록 (엑셀): 주소 지오코딩 + 중복검사
router.post('/workplaces/bulk', requireHR, async (req: Request, res: Response): Promise<void> => {
  if (!process.env.KAKAO_REST_KEY) { res.status(500).json({ error: '카카오 API 키가 설정되지 않았습니다.' }); return; }
  const rows: any[] = Array.isArray(req.body.rows) ? req.body.rows : [];
  let success = 0; const failed: any[] = [];
  for (const r of rows) {
    const name = (r.name || '').trim();
    const address = (r.address || '').trim();
    if (!name) { failed.push({ name: r.name || '(이름없음)', reason: '근무지명 누락' }); continue; }
    if (!address) { failed.push({ name, reason: '주소 누락' }); continue; }
    try {
      const dup = await workplaceDupCheck(name, address);
      if (dup.name && dup.address) { failed.push({ name, reason: '근무지명·주소 모두 중복' }); continue; }
      if (dup.name)    { failed.push({ name, reason: '근무지명 중복' }); continue; }
      if (dup.address) { failed.push({ name, reason: '주소 중복' }); continue; }
      const g = await geocodeAddress(address);
      if (!g) { failed.push({ name, reason: '주소 검색 실패(좌표 없음)' }); continue; }
      await pool.query(
        'INSERT INTO workplaces (name, lat, lng, radius_m, address, postal_code, detail_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [name, g.lat, g.lng, parseInt(r.radiusM, 10) || 300, g.road, g.zone || null, (r.detailAddress || '').trim() || null]
      );
      success++;
    } catch (e: any) { failed.push({ name, reason: e.message }); }
  }
  res.json({ success, failed });
});

// ── 직원 관리 ──────────────────────────────────────────────────

router.get('/workers', async (req: Request, res: Response): Promise<void> => {
  const { corp, division, team, position, jobTitle, needsAttention, page = '1', limit = '200' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(500, parseInt(limit as string, 10) || 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ["u.is_active=TRUE", "u.role IN ('worker','admin','hr')"];
  const params: unknown[] = [];
  if (corp)     { params.push(corp);     conditions.push(`u.corp=$${params.length}`); }
  if (division) { params.push(division); conditions.push(`u.division=$${params.length}`); }
  if (team)     { params.push(team);     conditions.push(`u.team=$${params.length}`); }
  if (position) { params.push(position); conditions.push(`u.position=$${params.length}`); }
  if (jobTitle) { params.push(jobTitle); conditions.push(`u.job_title=$${params.length}`); }
  // 기기 미등록 또는 비밀번호 미변경 근로자만 (첫 화면 우선 노출용)
  if (needsAttention === 'true') {
    conditions.push(`u.role='worker' AND (u.device_id IS NULL OR u.must_change_password=TRUE)`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) as count FROM users u ${where}`, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limitNum, offset);
  const { rows } = await pool.query(
    `SELECT u.id, u.employee_id, u.corp, u.division, u.team, u.position, u.job_title, u.name, u.phone,
            u.workplace_id, w.name AS workplace_name, w.lat AS wp_lat, w.lng AS wp_lng,
            u.scheduled_start, u.scheduled_end, u.lunch_start, u.lunch_end,
            u.remark, u.note_exempt, u.irregular_worker,
            u.email, u.device_id, u.is_locked, u.must_change_password, u.role, u.is_authority_holder, u.created_at
     FROM users u LEFT JOIN workplaces w ON u.workplace_id = w.id
     ${where}
     ORDER BY (u.role='worker' AND (u.device_id IS NULL OR u.must_change_password=TRUE)) DESC,
              u.is_authority_holder DESC NULLS LAST, u.role DESC,
              u.corp NULLS LAST, u.division NULLS LAST, u.team NULLS LAST, u.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ workers: rows, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
});

router.post('/workers', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, phone, position, corp, division, team, jobTitle, remark,
            scheduledStart, scheduledEnd, lunchStart, lunchEnd, workplaceId,
            noteExempt, irregularWorker } = req.body;
    const phoneDigits = (phone || '').replace(/\D/g, '');
    if (!name || !phoneDigits) { res.status(400).json({ error: '이름과 전화번호는 필수입니다.' }); return; }
    const passwordHash = await bcrypt.hash(phoneDigits, 12); // 초기 비밀번호 = 하이픈 제외 전화번호

    // 같은 전화번호의 기존 계정 확인 (소프트 삭제된 직원은 재활성화하여 근태 기록을 보존한다)
    const { rows: existing } = await pool.query(
      `SELECT id, is_active FROM users WHERE regexp_replace(phone, '\\D', '', 'g') = $1`, [phoneDigits]
    );
    if (existing[0]) {
      if (existing[0].is_active) { res.status(400).json({ error: '이미 등록된 전화번호입니다.' }); return; }
      // 비활성(삭제) 계정 → 재활성화: 정보 갱신 + 비밀번호/기기/잠금 초기화
      const { rows } = await pool.query(
        `UPDATE users SET name=$1, email=$2, position=$3, corp=$4, division=$5, team=$6, job_title=$7, remark=$8,
           scheduled_start=$9, scheduled_end=$10, lunch_start=$11, lunch_end=$12, workplace_id=$13,
           note_exempt=$14, irregular_worker=$15,
           password_hash=$16, must_change_password=TRUE, is_active=TRUE, role='worker',
           device_id=NULL, device_registered_at=NULL, is_locked=FALSE, failed_login_attempts=0, locked_reason=NULL
         WHERE id=$17 RETURNING id, name`,
        [name, email || null, position || null, corp || null, division || null, team || null, jobTitle || null, remark || null,
         scheduledStart || '09:00', scheduledEnd || '18:00', lunchStart || '12:00', lunchEnd || '13:00', workplaceId || null,
         !!noteExempt, !!irregularWorker, passwordHash, existing[0].id]
      );
      await generateTodaySlots(rows[0].id, scheduledStart, scheduledEnd, lunchStart, lunchEnd);
      res.status(201).json({ success: true, worker: rows[0], initPassword: phoneDigits, reactivated: true });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, position,
         corp, division, team, job_title, remark, scheduled_start, scheduled_end,
         lunch_start, lunch_end, workplace_id, note_exempt, irregular_worker)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id, name`,
      [email || null, passwordHash, name, phone, position || null,
       corp || null, division || null, team || null, jobTitle || null, remark || null,
       scheduledStart || '09:00', scheduledEnd || '18:00',
       lunchStart || '12:00', lunchEnd || '13:00', workplaceId || null, !!noteExempt, !!irregularWorker]
    );
    await generateTodaySlots(rows[0].id, scheduledStart, scheduledEnd, lunchStart, lunchEnd);
    res.status(201).json({ success: true, worker: rows[0], initPassword: phoneDigits });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 전화번호 또는 이메일입니다.' });
    else res.status(500).json({ error: e.message || '직원 추가 중 오류가 발생했습니다.' });
  }
});

router.put('/workers/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone, email, position, corp, division, team, jobTitle, remark,
            scheduledStart, scheduledEnd, lunchStart, lunchEnd, workplaceId,
            noteExempt, irregularWorker } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, phone=$2, email=$3, position=$4, corp=$5, division=$6, team=$7, job_title=$8,
         remark=$9, scheduled_start=$10, scheduled_end=$11, lunch_start=$12, lunch_end=$13, workplace_id=$14,
         note_exempt=$15, irregular_worker=$16
       WHERE id=$17 RETURNING id, name`,
      [name, phone || null, email || null, position || null, corp || null, division || null, team || null, jobTitle || null,
       remark || null, scheduledStart || '09:00', scheduledEnd || '18:00',
       lunchStart || '12:00', lunchEnd || '13:00', workplaceId || null, !!noteExempt, !!irregularWorker, req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, worker: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || '직원 정보 수정 중 오류가 발생했습니다.' });
  }
});

router.delete('/workers/:id', async (req: Request, res: Response): Promise<void> => {
  await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.put('/workers/:id/reset-password', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { newPassword } = req.body;
  const { rows: users } = await pool.query('SELECT id, name, phone FROM users WHERE id=$1 AND is_active=TRUE', [req.params.id]);
  if (!users[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }

  let plain: string;
  if (newPassword) {
    // 관리자가 비밀번호를 직접 지정한 경우 — 정책 검증
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) { res.status(400).json({ error: '비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.' }); return; }
    plain = newPassword;
  } else {
    // 비밀번호 미지정 — 전화번호(하이픈 제외)로 자동 초기화
    plain = (users[0].phone || '').replace(/\D/g, '');
    if (!plain) { res.status(400).json({ error: '전화번호가 없어 자동 초기화할 수 없습니다.' }); return; }
  }

  const passwordHash = await bcrypt.hash(plain, 12);
  await pool.query('UPDATE users SET password_hash=$1, must_change_password=TRUE WHERE id=$2', [passwordHash, users[0].id]);
  res.json({ success: true, initPassword: plain });
});

router.post('/workers/:id/reset-device', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `UPDATE users SET device_id=NULL, device_registered_at=NULL,
       is_locked=FALSE, failed_login_attempts=0
     WHERE id=$1 AND is_active=TRUE RETURNING id, name`,
    [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// ── 전체 현황 (팀별 누락/지각 집계) ──────────────────────────────

router.get('/overview', async (req: Request, res: Response): Promise<void> => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const { from, to } = req.query;
  const fromDate = (from as string) || today.slice(0, 7) + '-01';
  const toDate   = (to   as string) || today;

  const workdays = workdaysBetween(fromDate, toDate);
  const workdayCount = workdays.length;

  // 직원 전체
  const { rows: workers } = await pool.query(
    `SELECT id, name, corp, division, team, job_title, scheduled_start
     FROM users WHERE role='worker' AND is_active=TRUE ORDER BY corp, division, team, name`
  );
  if (workers.length === 0) { res.json({ teams: [], period: { from: fromDate, to: toDate, workdays: workdayCount } }); return; }

  const userIds = workers.map((w: any) => w.id);

  // 해당 기간 출퇴근 기록
  const { rows: records } = await pool.query(
    `SELECT ar.user_id, ar.date::text AS date, ar.check_in_time, ar.check_out_time,
            ar.status, ar.work_note_today, ar.daily_report, ar.leave_type
     FROM attendance_records ar
     WHERE ar.user_id=ANY($1) AND ar.date>=$2 AND ar.date<=$3`,
    [userIds, fromDate, toDate]
  );

  const byUser: Record<string, any[]> = {};
  for (const r of records) { (byUser[r.user_id] ||= []).push(r); }

  const enriched = workers.map((w: any) => {
    const recs = byUser[w.id] || [];
    const recByDate: Record<string, any> = {};
    for (const r of recs) recByDate[r.date] = r;

    let lateCount = 0, missingIn = 0, missingOut = 0, missingNote = 0;

    // 평일 처리
    for (const day of workdays) {
      const k = classifyDay(recByDate[day]);
      if (k.isLeave) continue;
      if (!k.present) { missingIn++; continue; }
      if (k.isLate) lateCount++;
      if (k.missingOut) missingOut++;
      if (k.missingNote) missingNote++;
    }
    // 주말 출근 기록도 KPI에 반영 (미출근 주말은 제외)
    for (const r of recs) {
      if (workdays.includes(r.date)) continue;
      const k = classifyDay(r);
      if (k.isLeave || !k.present) continue;
      if (k.isLate) lateCount++;
      if (k.missingOut) missingOut++;
      if (k.missingNote) missingNote++;
    }
    const score = lateCount + missingIn + missingOut + missingNote;
    return { ...w, lateCount, missingIn, missingOut, missingNote, score };
  });

  // 팀별 그룹핑
  const teamMap: Record<string, any> = {};
  for (const w of enriched) {
    const key = [w.corp, w.division, w.team].filter(Boolean).join(' > ') || '(미지정)';
    if (!teamMap[key]) teamMap[key] = { corp: w.corp, division: w.division, team: w.team, label: key, members: [] };
    teamMap[key].members.push(w);
  }

  res.json({ teams: Object.values(teamMap), period: { from: fromDate, to: toDate, workdays: workdayCount } });
});

// ── 개별 리포트 ─────────────────────────────────────────────────

router.get('/individual-report', async (req: Request, res: Response): Promise<void> => {
  const { userId, from, to } = req.query;
  if (!userId || !from || !to) { res.status(400).json({ error: 'userId, from, to가 필요합니다.' }); return; }

  const workdays = workdaysBetween(from as string, to as string);
  const workdaySet = new Set(workdays);

  // 직원 정보
  const { rows: userRows } = await pool.query(
    `SELECT u.id, u.name, u.corp, u.division, u.team, u.job_title, u.scheduled_start, u.scheduled_end,
            w.id AS wp_id, w.name AS wp_name, w.lat AS wp_lat, w.lng AS wp_lng, w.radius_m
     FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id WHERE u.id=$1`,
    [userId]
  );
  if (!userRows[0]) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }
  const user = userRows[0];

  // 출퇴근 기록
  const { rows: records } = await pool.query(
    `SELECT ar.id, ar.user_id, ar.date::text AS date,
            ar.check_in_time, ar.check_in_lat, ar.check_in_lng,
            ar.check_out_time, ar.check_out_lat, ar.check_out_lng, ar.check_out_is_field,
            ar.work_minutes, ar.status, ar.daily_report, ar.leave_type,
            ar.work_note_in, ar.work_note_out, ar.work_note_field, ar.work_note_today,
            ar.check_in_distance_m, ar.check_out_distance_m,
            ar.temp_time_change_reason, ar.temp_time_change_status
     FROM attendance_records ar
     WHERE ar.user_id=$1 AND ar.date>=$2 AND ar.date<=$3 ORDER BY ar.date`,
    [userId, from, to]
  );

  // 외근 기록
  const recIds = records.map((r: any) => r.id);
  const { rows: outings } = recIds.length ? await pool.query(
    `SELECT * FROM outing_records WHERE attendance_record_id=ANY($1) ORDER BY start_time`, [recIds]
  ) : { rows: [] };

  // 랜덤 위치 기록
  const { rows: randomChecks } = await pool.query(
    `SELECT *, date::text AS date FROM random_location_checks WHERE user_id=$1 AND date>=$2 AND date<=$3 ORDER BY scheduled_time`,
    [userId, from, to]
  );

  const recByDate: Record<string, any> = {};
  for (const r of records) recByDate[r.date] = r;
  const outByRecId: Record<string, any[]> = {};
  for (const o of outings) (outByRecId[o.attendance_record_id] ||= []).push(o);
  const rcByDate: Record<string, any[]> = {};
  for (const rc of randomChecks) (rcByDate[rc.date] ||= []).push(rc);

  let lateCount = 0, missingIn = 0, missingOut = 0, missingNote = 0;

  // 주말은 근무일에서 제외하되, 실제로 출근(체크인)했거나 출근 관련 연차/처리가 있는 날만 표시
  const weekendRecordDays = Object.keys(recByDate).filter(d => {
    if (workdaySet.has(d)) return false;
    const r = recByDate[d];
    const lt = r?.leave_type;
    const actuallyWorked = Boolean(r?.check_in_time) || lt === '연차' || leaveCountsAsCheckIn(lt);
    if (!actuallyWorked) return false;
    const [dy, dm, dd2] = d.split('-').map(Number);
    const dow = new Date(Date.UTC(dy, dm - 1, dd2, 12)).getUTCDay();
    return dow === 0 || dow === 6;
  }).sort();

  const allDisplayDays = [...workdays, ...weekendRecordDays].sort();

  const buildDayEntry = (day: string, isWorkday: boolean) => {
    const r = recByDate[day];
    const lt = r?.leave_type;
    const k = classifyDay(r);

    if (k.isLeave) return { date: day, leaveType: '연차' };

    if (!k.present) {
      if (isWorkday) { missingIn++; if (k.missingNote) missingNote++; }
      return { date: day, missing: true, noNote: isWorkday && k.missingNote };
    }

    const hasIn = Boolean(r.check_in_time);

    // 평일 KPI + 주말 출근한 경우도 KPI 반영
    if (isWorkday || hasIn) {
      if (k.isLate) lateCount++;
      if (k.missingOut)  missingOut++;
      if (k.missingNote) missingNote++;
    }

    return {
      date: day,
      leaveType: lt || undefined,
      checkIn: hasIn ? { time: r.check_in_time, lat: r.check_in_lat, lng: r.check_in_lng, distanceM: r.check_in_distance_m, note: r.work_note_in } : null,
      checkOut: r.check_out_time ? { time: r.check_out_time, lat: r.check_out_lat, lng: r.check_out_lng, distanceM: r.check_out_distance_m, isField: r.check_out_is_field, note: r.work_note_out } : null,
      status: r.status,
      workMinutes: r.work_minutes,
      isLate: k.isLate,
      noOut: k.missingOut,
      noNote: k.missingNote,
      noteField: r.work_note_field,
      noteToday: r.work_note_today || r.daily_report,
      timeChangeReason: r.temp_time_change_reason || undefined,
      outings: (outByRecId[r.id] || []),
      randomChecks: (rcByDate[day] || []),
    };
  };

  const days = allDisplayDays.map(day => buildDayEntry(day, workdaySet.has(day)));

  res.json({
    user,
    period: { from, to },
    kpi: { lateCount, missingIn, missingOut, missingNote },
    days,
  });
});

// GET /api/admin/report-scores?from&to — 기간 내 전 직원의 KPI 점수 일괄 계산 (관리대상 라벨/헤더 KPI 사전 표시용)
router.get('/report-scores', async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query;
  if (!from || !to) { res.status(400).json({ error: 'from, to가 필요합니다.' }); return; }

  const workdays = workdaysBetween(from as string, to as string);
  const workdaySet = new Set(workdays);

  const { rows: users } = await pool.query(
    `SELECT id FROM users WHERE role='worker' AND is_active=TRUE`
  );
  const ids = users.map((u: any) => u.id);
  if (!ids.length) { res.json({ scores: {} }); return; }

  const { rows: records } = await pool.query(
    `SELECT user_id, date::text AS date, check_in_time, check_out_time, status,
            work_note_today, daily_report, leave_type
     FROM attendance_records WHERE user_id=ANY($1) AND date>=$2 AND date<=$3`,
    [ids, from, to]
  );

  // user|date -> record
  const recByUD: Record<string, any> = {};
  const weekendWorkByUser: Record<string, Set<string>> = {};
  for (const r of records) {
    recByUD[`${r.user_id}|${r.date}`] = r;
    const [dy, dm, dd] = r.date.split('-').map(Number);
    const dow = new Date(Date.UTC(dy, dm - 1, dd, 12)).getUTCDay();
    if ((dow === 0 || dow === 6) && !workdaySet.has(r.date)) {
      const worked = Boolean(r.check_in_time) || r.leave_type === '연차' || leaveCountsAsCheckIn(r.leave_type);
      if (worked) (weekendWorkByUser[r.user_id] ||= new Set()).add(r.date);
    }
  }

  const scores: Record<string, any> = {};
  for (const uid of ids) {
    let lateCount = 0, missingIn = 0, missingOut = 0, missingNote = 0;
    const days = [...workdays, ...(weekendWorkByUser[uid] || [])];
    for (const day of days) {
      const isWorkday = workdaySet.has(day);
      const r = recByUD[`${uid}|${day}`];
      const k = classifyDay(r);
      if (k.isLeave) continue;
      if (!k.present) {
        if (isWorkday) { missingIn++; if (k.missingNote) missingNote++; }
        continue;
      }
      if (isWorkday || Boolean(r?.check_in_time)) {
        if (k.isLate) lateCount++;
        if (k.missingOut) missingOut++;
        if (k.missingNote) missingNote++;
      }
    }
    scores[uid] = { lateCount, missingIn, missingOut, missingNote, score: lateCount + missingIn + missingOut + missingNote };
  }

  res.json({ scores });
});

// POST /api/admin/send-report — 지정 인원에게 기간 리포트 링크를 수동 발송 (이메일 우선, 없으면 문자)
router.post('/send-report', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { userIds, from, to } = req.body;
  if (!Array.isArray(userIds) || !userIds.length || !from || !to) { res.status(400).json({ error: '발송 대상과 기간이 필요합니다.' }); return; }
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const m = Number(String(from).split('-')[1]);
  const monthLabel = `${m}`;
  // 발송일(KST) 및 시말서 마감일(+7일)
  const sentStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const dl = new Date(sentStr + 'T00:00:00Z'); dl.setUTCDate(dl.getUTCDate() + 7);
  const deadlineText = `${dl.getUTCMonth() + 1}월 ${dl.getUTCDate()}일`;
  // 법인별 담당자 매핑 (등록 기기에 담당 법인·전화·담당자명이 설정된 경우)
  const { rows: mgrRows } = await pool.query(
    `SELECT corp, device_name, phone FROM admin_devices WHERE corp IS NOT NULL AND corp<>''`
  );
  const managerByCorp: Record<string, { name: string; phone: string }> = {};
  for (const mr of mgrRows) if (!managerByCorp[mr.corp]) managerByCorp[mr.corp] = { name: mr.device_name || '', phone: mr.phone || '' };
  const results: any[] = [];
  for (const uid of userIds) {
    const rep = await buildIndividualReport(uid, from, to);
    if (!rep) { results.push({ userId: uid, ok: false, reason: '대상 없음' }); continue; }
    const token = jwt.sign({ uid, from, to, sent: sentStr }, process.env.JWT_SECRET as string, { expiresIn: '60d' });
    const link = `${base}/api/report?t=${token}`;
    try {
      const via = await sendReportLink({
        name: rep.user.name, email: rep.user.email, phone: rep.user.phone, monthLabel, link,
        corpName: rep.user.corp, over: rep.over, deadlineText,
        managerName: managerByCorp[rep.user.corp]?.name || '',
        managerPhone: managerByCorp[rep.user.corp]?.phone || '',
      });
      results.push({ userId: uid, name: rep.user.name, ok: via !== 'none', via });
    } catch (e: any) {
      results.push({ userId: uid, name: rep.user.name, ok: false, reason: e.message });
    }
  }
  const sent = results.filter((r) => r.ok).length;
  res.json({ sent, total: results.length, results });
});

// ── 출퇴근 기록 조회 ───────────────────────────────────────────

router.get('/attendance', async (req: Request, res: Response): Promise<void> => {
  const { corp, team, date, from, to, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(200, parseInt(limit as string, 10) || 50);
  const offset = (pageNum - 1) * limitNum;
  const targetDate = (date as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  const conditions: string[] = ["u.role='worker'"];
  const params: unknown[] = [];
  if (from) { params.push(from); conditions.push(`ar.date>=$${params.length}`); }
  else { params.push(targetDate); conditions.push(`ar.date=$${params.length}`); }
  if (to) { params.push(to); conditions.push(`ar.date<=$${params.length}`); }
  if (corp) { params.push(corp); conditions.push(`u.corp=$${params.length}`); }
  if (team) { params.push(team); conditions.push(`u.team=$${params.length}`); }

  const base = `FROM users u JOIN attendance_records ar ON ar.user_id=u.id WHERE ${conditions.join(' AND ')}`;
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) as count ${base}`, params);
  params.push(limitNum, offset);

  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.corp, u.division, u.team, u.job_title,
            ar.id AS record_id, ar.date, ar.check_in_time, ar.check_in_lat, ar.check_in_lng, ar.check_in_distance_m,
            ar.check_out_time, ar.check_out_lat, ar.check_out_lng, ar.check_out_distance_m, ar.check_out_is_field,
            ar.status, ar.work_minutes, ar.work_note_today, ar.daily_report, ar.leave_type,
            ar.temp_time_change_status, ar.temp_time_change_requested_end, ar.temp_time_change_reason
     ${base} ORDER BY u.corp, u.team, u.name LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  );

  const recordIds = rows.map((r: any) => r.record_id);
  const outings = recordIds.length ? (await pool.query(
    `SELECT attendance_record_id, destination, start_time, end_time FROM outing_records WHERE attendance_record_id=ANY($1)`,
    [recordIds]
  )).rows : [];

  const result = rows.map((r: any) => ({
    userId: r.user_id, name: r.name, corp: r.corp, division: r.division, team: r.team, jobTitle: r.job_title,
    checkIn: { time: r.check_in_time, lat: r.check_in_lat, lng: r.check_in_lng, distanceM: r.check_in_distance_m },
    checkOut: r.check_out_time ? { time: r.check_out_time, lat: r.check_out_lat, lng: r.check_out_lng, distanceM: r.check_out_distance_m, isField: r.check_out_is_field } : null,
    status: r.status, workMinutes: r.work_minutes, leaveType: r.leave_type,
    noteToday: r.work_note_today || r.daily_report,
    isLate: r.status === '지각' || r.status === '지각조퇴',
    timeChangeStatus: r.temp_time_change_status,
    timeChangeRequestedEnd: r.temp_time_change_requested_end,
    outings: outings.filter((o: any) => o.attendance_record_id === r.record_id),
  }));

  res.json({ date: targetDate, records: result, pagination: { total: parseInt(countRows[0].count, 10), page: pageNum, limit: limitNum } });
});

// ── 연차/반차 설정 ─────────────────────────────────────────────

router.post('/attendance/:recordId/set-leave', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { leaveType } = req.body; // '연차'|'반차'|'반반차'|null
  const { rows } = await pool.query(
    'UPDATE attendance_records SET leave_type=$1 WHERE id=$2 RETURNING id',
    [leaveType || null, req.params.recordId]
  );
  if (!rows[0]) { res.status(404).json({ error: '기록을 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// POST: 날짜별 연차 생성 (기록 없을 때)
router.post('/attendance/set-leave-day', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { userId, date, leaveType } = req.body;
  if (!userId || !date) { res.status(400).json({ error: 'userId, date가 필요합니다.' }); return; }

  // 출근/출퇴근 인정 시 예정 근무시간 계산
  let scheduledMinutes: number | null = null;
  if (leaveType === '출근' || leaveType === '출퇴근' || leaveType === '출근+노트' || leaveType === '출퇴근+노트') {
    const { rows: uRows } = await pool.query('SELECT scheduled_start, scheduled_end FROM users WHERE id=$1', [userId]);
    if (uRows[0]) {
      const toMin = (t: string) => { const [h, m] = (t || '').slice(0, 5).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      const mins = toMin(uRows[0].scheduled_end) - toMin(uRows[0].scheduled_start);
      if (mins > 0) scheduledMinutes = mins;
    }
  }

  const { rows: existing } = await pool.query(
    'SELECT id, check_in_time, work_minutes FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]
  );
  if (existing.length > 0) {
    const rec = existing[0];
    // 체크인 없고 근무시간 없을 때만 예정 근무시간 기입
    const updateMins = scheduledMinutes !== null && !rec.check_in_time && !rec.work_minutes;
    if (updateMins) {
      await pool.query('UPDATE attendance_records SET leave_type=$1, work_minutes=$2 WHERE id=$3', [leaveType || null, scheduledMinutes, rec.id]);
    } else {
      await pool.query('UPDATE attendance_records SET leave_type=$1 WHERE id=$2', [leaveType || null, rec.id]);
    }
  } else {
    await pool.query(
      'INSERT INTO attendance_records (user_id, date, leave_type, work_minutes) VALUES ($1,$2,$3,$4)',
      [userId, date, leaveType || null, scheduledMinutes]
    );
  }
  res.json({ success: true });
});

// ── 기기 변경 요청 관리 ────────────────────────────────────────

router.get('/device-change-requests', async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT dcr.id, dcr.reason, dcr.status, dcr.requested_at, u.name, u.email
     FROM device_change_requests dcr JOIN users u ON u.id=dcr.user_id
     WHERE dcr.status=$1 ORDER BY dcr.requested_at DESC`,
    [status]
  );
  res.json({ requests: rows });
});

router.post('/device-change-requests/:id/approve', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query("SELECT * FROM device_change_requests WHERE id=$1 AND status='pending'", [req.params.id]);
  if (!rows[0]) { res.status(404).json({ error: '요청을 찾을 수 없습니다.' }); return; }
  await pool.query('UPDATE users SET device_id=$1, device_registered_at=now(), is_locked=FALSE, failed_login_attempts=0 WHERE id=$2',
    [rows[0].new_device_id, rows[0].user_id]);
  await pool.query("UPDATE device_change_requests SET status='approved', processed_at=now(), processed_by=$1 WHERE id=$2",
    [req.user.userId, req.params.id]);
  res.json({ success: true });
});

router.post('/device-change-requests/:id/reject', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query("UPDATE device_change_requests SET status='rejected', processed_at=now(), processed_by=$1 WHERE id=$2 AND status='pending'",
    [req.user.userId, req.params.id]);
  res.json({ success: true });
});

// ── 계정 잠금 해제 ────────────────────────────────────────────

router.post('/users/:id/unlock', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('UPDATE users SET is_locked=FALSE, locked_reason=NULL, failed_login_attempts=0 WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── 퇴근 시간 변경 승인 ───────────────────────────────────────

router.post('/attendance/:recordId/approve-time-change', async (req: Request, res: Response): Promise<void> => {
  const { approve } = req.body;
  const { rows } = await pool.query(
    `UPDATE attendance_records SET temp_time_change_status=$1, temp_time_change_approved_by=$2
     WHERE id=$3 AND temp_time_change_status='pending' RETURNING id`,
    [approve ? 'approved' : 'rejected', req.user.userId, req.params.recordId]
  );
  if (!rows[0]) { res.status(404).json({ error: '대기 중인 요청을 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// ── 전체현황 대시보드 (기존 dashboard → overview로 통합) ────────

router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const { rows: todayRows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ar.check_in_time IS NOT NULL) AS checked_in,
            COUNT(*) FILTER (WHERE ar.check_out_time IS NOT NULL) AS checked_out,
            COUNT(*) FILTER (WHERE ar.status IN ('지각','지각조퇴')) AS late,
            COUNT(*) AS total
     FROM attendance_records ar JOIN users u ON ar.user_id=u.id
     WHERE ar.date=$1 AND u.role='worker' AND u.is_active=TRUE`, [today]
  );
  const { rows: staffCount } = await pool.query("SELECT COUNT(*) as count FROM users WHERE role='worker' AND is_active=TRUE");
  res.json({ today: todayRows[0], totalStaff: parseInt(staffCount[0].count, 10) });
});

// ── 관리자 기기 관리 ──────────────────────────────────────────

// 내 기기 목록 + 권한자면 전체 대기 기기 목록
router.get('/my-devices', async (req: Request, res: Response): Promise<void> => {
  const isHolder = !!req.user.isAuthority;
  const { rows: myDevices } = await pool.query(
    'SELECT id, device_id, device_name, corp, phone, is_approved, is_authority, approved_at, created_at FROM admin_devices WHERE user_id=$1 ORDER BY created_at',
    [req.user.userId]
  );
  let pendingDevices: any[] = [];
  if (isHolder) {
    const { rows } = await pool.query(
      `SELECT ad.id, ad.device_id, ad.device_name, ad.created_at, u.name AS owner_name, u.email AS owner_email, u.id AS owner_id
       FROM admin_devices ad JOIN users u ON u.id = ad.user_id
       WHERE ad.is_approved = FALSE ORDER BY ad.created_at`
    );
    pendingDevices = rows;
  }
  res.json({ myDevices, pendingDevices, isAuthorityHolder: isHolder });
});

// 특정 관리자의 기기 목록 (모든 관리자 조회 가능 — 편집 권한은 별도)
router.get('/admin-devices/:userId', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'SELECT id, device_id, device_name, corp, phone, is_approved, is_authority, approved_at, created_at FROM admin_devices WHERE user_id=$1 ORDER BY created_at',
    [req.params.userId]
  );
  res.json({ devices: rows });
});

// 기기 승인 (권한자 기기만)
router.post('/devices/:id/approve', async (req: Request, res: Response): Promise<void> => {
  if (!req.user.isAuthority) { res.status(403).json({ error: '권한자만 승인할 수 있습니다.' }); return; }
  const { rows } = await pool.query(
    'UPDATE admin_devices SET is_approved=TRUE, approved_by=$1, approved_at=now() WHERE id=$2 AND is_approved=FALSE RETURNING id',
    [req.user.userId, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '승인할 기기를 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// 기기 삭제 (권한자 기기만, 권한자 기기 자신은 삭제 불가)
router.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  if (!req.user.isAuthority) { res.status(403).json({ error: '권한자만 삭제할 수 있습니다.' }); return; }
  const { rows } = await pool.query('SELECT is_authority FROM admin_devices WHERE id=$1', [req.params.id]);
  if (!rows[0]) { res.status(404).json({ error: '기기를 찾을 수 없습니다.' }); return; }
  if (rows[0].is_authority) { res.status(400).json({ error: '권한자 기기는 삭제할 수 없습니다. 먼저 권한을 이전하세요.' }); return; }
  await pool.query('DELETE FROM admin_devices WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// 기기 정보(담당자명=device_name, 담당 법인, 전화번호) 수정
router.put('/devices/:id/info', async (req: Request, res: Response): Promise<void> => {
  const { deviceName, corp, phone } = req.body;
  const { rows } = await pool.query(
    `UPDATE admin_devices SET device_name=$1, corp=$2, phone=$3 WHERE id=$4
     RETURNING id, device_name, corp, phone`,
    [deviceName || null, corp || null, phone || null, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '기기를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, device: rows[0] });
});

// 권한자 이전 (현재 권한자 기기 → 대상 기기). 이전 후에는 재로그인 시 반영.
router.put('/authority/transfer', async (req: Request, res: Response): Promise<void> => {
  if (!req.user.isAuthority) { res.status(403).json({ error: '권한자만 이전할 수 있습니다.' }); return; }
  const { targetDeviceId } = req.body; // admin_devices.id
  if (!targetDeviceId) { res.status(400).json({ error: 'targetDeviceId가 필요합니다.' }); return; }
  const { rows: target } = await pool.query(
    'SELECT id FROM admin_devices WHERE id=$1 AND is_approved=TRUE', [targetDeviceId]
  );
  if (!target[0]) { res.status(400).json({ error: '승인된 대상 기기를 찾을 수 없습니다.' }); return; }
  await pool.query('UPDATE admin_devices SET is_authority=FALSE WHERE is_authority=TRUE');
  await pool.query('UPDATE admin_devices SET is_authority=TRUE WHERE id=$1', [targetDeviceId]);
  res.json({ success: true });
});

// ── 설정 (회사 지오펜스 — 레거시, 근무지로 대체 권장) ──────────

router.get('/company-settings', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT * FROM company_settings ORDER BY id LIMIT 1');
  res.json({ settings: rows[0] || null });
});

router.post('/company-settings', async (req: Request, res: Response): Promise<void> => {
  const { lat, lng, radiusMeters, description } = req.body;
  if (!lat || !lng) { res.status(400).json({ error: 'lat, lng는 필수입니다.' }); return; }
  const { rows: existing } = await pool.query('SELECT id FROM company_settings ORDER BY id LIMIT 1');
  if (existing.length > 0) {
    await pool.query('UPDATE company_settings SET lat=$1, lng=$2, radius_meters=$3, description=$4, updated_at=now() WHERE id=$5',
      [lat, lng, radiusMeters || 100, description || null, existing[0].id]);
  } else {
    await pool.query('INSERT INTO company_settings (lat, lng, radius_meters, description) VALUES ($1,$2,$3,$4)',
      [lat, lng, radiusMeters || 100, description || null]);
  }
  res.json({ success: true });
});

// ── 공휴일 관리 ──────────────────────────────────────────────────────────────
router.get('/holidays', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT id, date::text AS date, name FROM public_holidays ORDER BY date');
  res.json({ holidays: rows });
});

router.post('/holidays', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { date, name } = req.body;
  if (!date) { res.status(400).json({ error: 'date는 필수입니다.' }); return; }
  const { rows } = await pool.query(
    'INSERT INTO public_holidays (date, name) VALUES ($1,$2) ON CONFLICT (date) DO UPDATE SET name=EXCLUDED.name RETURNING id, date::text AS date, name',
    [date, name || '']
  );
  const all = await pool.query('SELECT date::text AS date FROM public_holidays');
  refreshHolidayCache(all.rows.map((r: any) => r.date));
  res.status(201).json({ holiday: rows[0] });
});

router.delete('/holidays/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM public_holidays WHERE id=$1', [req.params.id]);
  const all = await pool.query('SELECT date::text AS date FROM public_holidays');
  refreshHolidayCache(all.rows.map((r: any) => r.date));
  res.json({ success: true });
});

// ── 조직 마스터: 법인 ────────────────────────────────────────────────────────
router.get('/corporations', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT id, name, address FROM corporations ORDER BY name');
  res.json({ corporations: rows });
});
router.post('/corporations', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, address } = req.body;
  if (!name) { res.status(400).json({ error: '법인명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query(
      'INSERT INTO corporations (name, address) VALUES ($1,$2) RETURNING id, name, address',
      [name, address || null]
    );
    res.status(201).json({ corporation: rows[0] });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 법인명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.delete('/corporations/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM corporations WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── 조직 마스터: 본부 및 팀 ───────────────────────────────────────────────────
router.get('/divisions', async (_req: Request, res: Response): Promise<void> => {
  const { rows: divs } = await pool.query('SELECT id, name FROM divisions ORDER BY name');
  const { rows: teams } = await pool.query('SELECT id, division_id, name FROM teams ORDER BY name');
  const byDiv: Record<string, any[]> = {};
  for (const t of teams) (byDiv[t.division_id] ||= []).push({ id: t.id, name: t.name });
  res.json({ divisions: divs.map((d: any) => ({ ...d, teams: byDiv[d.id] || [] })) });
});
// 본부 생성 (팀 여러 개 동시 생성 가능)
router.post('/divisions', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, teams } = req.body;
  if (!name) { res.status(400).json({ error: '본부명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query('INSERT INTO divisions (name) VALUES ($1) RETURNING id, name', [name]);
    const div = rows[0];
    const teamNames: string[] = Array.isArray(teams) ? teams.filter((t: string) => t && t.trim()) : [];
    for (const tn of teamNames) {
      await pool.query('INSERT INTO teams (division_id, name) VALUES ($1,$2) ON CONFLICT (division_id, name) DO NOTHING', [div.id, tn.trim()]);
    }
    res.status(201).json({ division: div });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 본부명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.delete('/divisions/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM divisions WHERE id=$1', [req.params.id]); // 팀은 CASCADE 삭제
  res.json({ success: true });
});
// 팀 단건 추가 (기존 본부에)
router.post('/divisions/:id/teams', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: '팀명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query(
      'INSERT INTO teams (division_id, name) VALUES ($1,$2) RETURNING id, division_id, name',
      [req.params.id, name.trim()]
    );
    res.status(201).json({ team: rows[0] });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 팀명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.delete('/teams/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM teams WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── 조직 마스터: 직책 ────────────────────────────────────────────────────────
router.get('/positions', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT id, name FROM positions ORDER BY name');
  res.json({ positions: rows });
});
// 여러 개 동시 추가 가능
router.post('/positions', requireHR, async (req: Request, res: Response): Promise<void> => {
  const names: string[] = Array.isArray(req.body.names) ? req.body.names : (req.body.name ? [req.body.name] : []);
  const clean = names.map((n) => (n || '').trim()).filter(Boolean);
  if (clean.length === 0) { res.status(400).json({ error: '직책명은 필수입니다.' }); return; }
  const added: any[] = [];
  for (const n of clean) {
    const { rows } = await pool.query(
      'INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name', [n]
    );
    if (rows[0]) added.push(rows[0]);
  }
  res.status(201).json({ positions: added });
});
router.delete('/positions/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM positions WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── 조직 마스터: 근무시간(직무 프리셋) ────────────────────────────────────────
router.get('/job-schedules', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, name, to_char(work_start,'HH24:MI') AS "workStart", to_char(work_end,'HH24:MI') AS "workEnd",
            to_char(break_start,'HH24:MI') AS "breakStart", to_char(break_end,'HH24:MI') AS "breakEnd"
     FROM job_schedules ORDER BY name`
  );
  res.json({ jobSchedules: rows });
});
router.post('/job-schedules', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, workStart, workEnd, breakStart, breakEnd } = req.body;
  if (!name) { res.status(400).json({ error: '직무명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO job_schedules (name, work_start, work_end, break_start, break_end)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name`,
      [name, workStart || '09:00', workEnd || '18:00', breakStart || '12:00', breakEnd || '13:00']
    );
    res.status(201).json({ jobSchedule: rows[0] });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 직무명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.put('/job-schedules/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, workStart, workEnd, breakStart, breakEnd } = req.body;
  const { rows } = await pool.query(
    `UPDATE job_schedules SET name=$1, work_start=$2, work_end=$3, break_start=$4, break_end=$5
     WHERE id=$6 RETURNING id, name`,
    [name, workStart, workEnd, breakStart, breakEnd, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '직무를 찾을 수 없습니다.' }); return; }
  res.json({ jobSchedule: rows[0] });
});
router.delete('/job-schedules/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('DELETE FROM job_schedules WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── 일괄 등록: 공휴일 ─────────────────────────────────────────────────────────
router.post('/holidays/bulk', requireHR, async (req: Request, res: Response): Promise<void> => {
  const rows: any[] = Array.isArray(req.body.rows) ? req.body.rows : [];
  let success = 0; const failed: any[] = [];
  for (const r of rows) {
    const date = (r.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { failed.push({ date: r.date, name: r.name, reason: '날짜 형식 오류(YYYY-MM-DD)' }); continue; }
    try {
      await pool.query('INSERT INTO public_holidays (date, name) VALUES ($1,$2) ON CONFLICT (date) DO UPDATE SET name=EXCLUDED.name', [date, (r.name || '').trim()]);
      success++;
    } catch (e: any) { failed.push({ date: r.date, name: r.name, reason: e.message }); }
  }
  const all = await pool.query('SELECT date::text AS date FROM public_holidays');
  refreshHolidayCache(all.rows.map((x: any) => x.date));
  res.json({ success, failed });
});

// ── 일괄 등록: 직원 ───────────────────────────────────────────────────────────
router.post('/workers/bulk', requireHR, async (req: Request, res: Response): Promise<void> => {
  const rows: any[] = Array.isArray(req.body.rows) ? req.body.rows : [];
  // 근무지·직무 이름 → 매핑 준비
  const { rows: wps } = await pool.query('SELECT id, name FROM workplaces');
  const wpByName: Record<string, string> = {}; for (const w of wps) wpByName[w.name] = w.id;
  const { rows: jss } = await pool.query(
    `SELECT name, to_char(work_start,'HH24:MI') s, to_char(work_end,'HH24:MI') e,
            to_char(break_start,'HH24:MI') bs, to_char(break_end,'HH24:MI') be FROM job_schedules`
  );
  const jsByName: Record<string, any> = {}; for (const j of jss) jsByName[j.name] = j;

  let success = 0; const failed: any[] = [];
  for (const r of rows) {
    const name = (r.name || '').trim();
    const phoneDigits = (r.phone || '').replace(/\D/g, '');
    const info = { corp: r.corp, division: r.division, team: r.team, jobTitle: r.jobTitle, name };
    if (!name || !phoneDigits) { failed.push({ ...info, reason: '이름/전화번호 누락' }); continue; }
    const workplaceId = r.workplaceName ? wpByName[String(r.workplaceName).trim()] : null;
    if (r.workplaceName && !workplaceId) { failed.push({ ...info, reason: `근무지 '${r.workplaceName}' 없음` }); continue; }
    const js = r.jobTitle ? jsByName[String(r.jobTitle).trim()] : null;
    if (r.jobTitle && !js) { failed.push({ ...info, reason: `직무 '${r.jobTitle}' 없음` }); continue; }
    const times = js ? { s: js.s, e: js.e, bs: js.bs, be: js.be } : { s: '09:00', e: '18:00', bs: '12:00', be: '13:00' };
    const noteExempt = String(r.noteExempt) === '1' || r.noteExempt === true;
    const irregular = String(r.irregularWorker) === '1' || r.irregularWorker === true;
    try {
      const passwordHash = await bcrypt.hash(phoneDigits, 12);
      const { rows: existing } = await pool.query(`SELECT id, is_active FROM users WHERE regexp_replace(phone,'\\D','','g')=$1`, [phoneDigits]);
      if (existing[0] && existing[0].is_active) { failed.push({ ...info, reason: '이미 등록된 전화번호' }); continue; }
      if (existing[0]) {
        await pool.query(
          `UPDATE users SET name=$1, email=$2, position=$3, corp=$4, division=$5, team=$6, job_title=$7, remark=$8,
             scheduled_start=$9, scheduled_end=$10, lunch_start=$11, lunch_end=$12, workplace_id=$13,
             note_exempt=$14, irregular_worker=$15, password_hash=$16, must_change_password=TRUE, is_active=TRUE, role='worker',
             device_id=NULL, device_registered_at=NULL, is_locked=FALSE, failed_login_attempts=0, locked_reason=NULL WHERE id=$17`,
          [name, r.email || null, r.position || null, r.corp || null, r.division || null, r.team || null, r.jobTitle || null, r.remark || null,
           times.s, times.e, times.bs, times.be, workplaceId, noteExempt, irregular, passwordHash, existing[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO users (email, password_hash, name, phone, position, corp, division, team, job_title, remark,
             scheduled_start, scheduled_end, lunch_start, lunch_end, workplace_id, note_exempt, irregular_worker)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [r.email || null, passwordHash, name, r.phone, r.position || null, r.corp || null, r.division || null, r.team || null, r.jobTitle || null, r.remark || null,
           times.s, times.e, times.bs, times.be, workplaceId, noteExempt, irregular]
        );
      }
      success++;
    } catch (e: any) {
      failed.push({ ...info, reason: e.code === '23505' ? '중복(전화번호/이메일)' : e.message });
    }
  }
  res.json({ success, failed });
});

// ── 인원 직접 검색 (동명이인 구분용) ─────────────────────────────────────────
router.get('/worker-search', async (req: Request, res: Response): Promise<void> => {
  const name = ((req.query.name as string) || '').trim();
  if (!name) { res.json({ workers: [] }); return; }
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.corp, u.division, u.team, w.name AS workplace_name
     FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id
     WHERE u.is_active=TRUE AND u.role='worker' AND u.name=$1
     ORDER BY u.corp NULLS LAST, u.division NULLS LAST, u.team NULLS LAST`,
    [name]
  );
  res.json({ workers: rows });
});

// ── 전체현황: 월간 근태대장 ───────────────────────────────────────────────────
router.get('/monthly-overview', async (req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const year  = parseInt((req.query.year as string) || String(now.getFullYear()), 10);
  const month = parseInt((req.query.month as string) || String(now.getMonth() + 1), 10); // 1-12
  const { corp, division, team, position, userIds } = req.query;
  const pageNum = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const PER_PAGE = 10;

  const daysInMonth = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const fromDate = `${year}-${mm}-01`;
  const toDate   = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;

  // 공휴일 (해당 월)
  const { rows: holRows } = await pool.query(
    `SELECT date::text AS date, name FROM public_holidays WHERE date>=$1 AND date<=$2`, [fromDate, toDate]
  );
  const holidays: Record<string, string> = {};
  for (const h of holRows) holidays[h.date] = h.name;

  // 대상 직원
  const conds = ["u.is_active=TRUE", "u.role='worker'"];
  const params: unknown[] = [];
  if (userIds) {
    const ids = String(userIds).split(',').filter(Boolean);
    params.push(ids); conds.push(`u.id = ANY($${params.length})`);
  } else {
    if (corp)     { params.push(corp);     conds.push(`u.corp=$${params.length}`); }
    if (division) { params.push(division); conds.push(`u.division=$${params.length}`); }
    if (team)     { params.push(team);     conds.push(`u.team=$${params.length}`); }
    if (position) { params.push(position); conds.push(`u.position=$${params.length}`); }
  }
  const full = req.query.full === '1'; // 다운로드용: 페이지네이션 없이 전체 + 출퇴근지·비고 포함
  const { rows: allWorkers } = await pool.query(
    `SELECT u.id, u.name, u.corp, u.division, u.team, u.position, u.remark, u.note_exempt, u.irregular_worker,
            w.name AS workplace_name
     FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id
     WHERE ${conds.join(' AND ')} ORDER BY u.name`, params
  );
  const total = allWorkers.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageWorkers = full ? allWorkers : allWorkers.slice((pageNum - 1) * PER_PAGE, pageNum * PER_PAGE);

  // 해당 월 출퇴근 기록
  const ids = pageWorkers.map((w: any) => w.id);
  const recByUserDate: Record<string, any> = {};
  if (ids.length) {
    const { rows: recs } = await pool.query(
      `SELECT user_id, date::text AS date, check_in_time, check_out_time, status,
              work_note_in, work_note_out, work_note_today, daily_report, leave_type
       FROM attendance_records WHERE user_id=ANY($1) AND date>=$2 AND date<=$3`,
      [ids, fromDate, toDate]
    );
    for (const r of recs) recByUserDate[`${r.user_id}|${r.date}`] = r;
  }

  const dowOf = (d: number) => new Date(Date.UTC(year, month - 1, d, 12)).getUTCDay(); // 0=일,6=토
  const hhmm = (t: any) => (t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 5) : null);

  const dayTotals: number[] = Array(daysInMonth + 1).fill(0); // index 1..daysInMonth

  const workers = pageWorkers.map((w: any) => {
    let workedDays = 0, lateMissing = 0, noteMissing = 0, leaveCount = 0, clockCount = 0;
    const days: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;
      if (dateStr > todayStr) { days.push({ off: true, future: true }); continue; } // 미래 → '-', 하이라이트/집계 제외
      const r = recByUserDate[`${w.id}|${dateStr}`];
      const lt = r?.leave_type ?? null;
      const isHol = !!holidays[dateStr];
      const dow = dowOf(d);
      const isWeekend = dow === 0 || dow === 6;
      const hasIn = !!r?.check_in_time;
      const hasOutRec = !!r?.check_out_time;
      const present = hasIn || leaveCountsAsCheckIn(lt);
      if (hasIn) clockCount++;
      if (hasOutRec) clockCount++;

      if (lt === '연차') { leaveCount++; days.push({ leave: '연차' }); continue; }

      // 근무일 판정: 비정기 근로자는 실제 출근(또는 출근인정)한 날만, 그 외엔 평일(공휴일 제외)+공휴일/주말 출근한 날
      const workday = w.irregular_worker ? present : ((!isWeekend && !isHol) || present);

      if (!workday) { days.push({ off: true }); continue; }   // 근무일 아님 → '-'
      if (present) dayTotals[d]++; // 실제 출근 또는 관리자 출근인정 모두 포함

      const late = (r?.status === '지각' || r?.status === '지각조퇴') && !leaveCountsAsCheckIn(lt);
      const hasOut = hasOutRec || leaveCountsAsCheckOut(lt);
      const missingIn = !present;
      const missingOut = present && !hasOut;
      // 근무노트 누락: 상황 불문, 노트 없으면 무조건 누락 (노트제외 직원·노트인정 leave 예외)
      const noteMiss = !w.note_exempt && !leaveCountsAsNote(lt) && !r?.work_note_today && !r?.daily_report;

      if (present) workedDays++;
      // 하루당 최대 1건: 출근누락 > 퇴근누락 > 지각 우선순위 (지각+퇴근누락은 퇴근누락으로 1건)
      if (missingIn) lateMissing++;
      else if (missingOut) lateMissing++;
      else if (late) lateMissing++;
      if (noteMiss) noteMissing++;

      const bothMissing = !hasIn && !hasOutRec && !r?.work_note_today && !r?.daily_report; // 출퇴근·노트 모두 없음 → 'X'
      days.push({
        checkIn: hhmm(r?.check_in_time),
        checkOut: hhmm(r?.check_out_time),
        checkInPlace: r?.work_note_in || null,
        checkOutPlace: r?.work_note_out || null,
        late, missingIn, missingOut, noteMiss, bothMissing,
        leave: lt || undefined,
      });
    }
    return {
      id: w.id, name: w.name, corp: w.corp, division: w.division, team: w.team,
      remark: w.remark || '', workplaceName: w.workplace_name || '',
      irregularWorker: w.irregular_worker,
      days,
      workedDays, lateMissing, noteMissing, leaveCount, clockCount,
      over: (lateMissing + noteMissing) >= 5,
    };
  });

  res.json({
    year, month, daysInMonth,
    holidays,
    dow: Array.from({ length: daysInMonth }, (_, i) => dowOf(i + 1)),
    workers,
    dayTotals: dayTotals.slice(1),
    pagination: { total, page: pageNum, pages: totalPages, perPage: PER_PAGE },
  });
});

export default router;

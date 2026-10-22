import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { workdaysBetween, refreshHolidayCache } from '../utils/holidays';
import { classifyDay, leaveCountsAsCheckIn, leaveCountsAsCheckOut, leaveCountsAsNote } from '../utils/attendanceKpi';
import { generateRandomCheckSlotsForUser } from '../jobs/scheduler';
import jwt from 'jsonwebtoken';
import { buildIndividualReport } from '../services/reportBuilder';
import { sendReportLink, sendAdminDeviceInvite } from '../services/reportSender';
import { invalidateTemplateCache } from '../services/messageTemplates';

const router = Router();
router.use(requireAuth, requireAdmin);

// 관리자 요청마다 '이 기기'의 등록·승인 여부와 권한(권한자/권한키/권한팀)을 한 번에 읽어 붙인다.
// - 삭제/승인취소된 기기는 접근토큰이 남아 있어도 즉시 차단(재로그인 필요)
// - 세부 쓰기 권한(permissions)은 엔드포인트별로 requirePerm으로 확인한다.
router.use(async (req: Request, res: Response, next): Promise<void> => {
  // 구버전 토큰(기기정보 없음)은 권한 없이 읽기전용으로 제한(권한 상승 방지). 재로그인 시 정상 권한.
  if (!req.user.deviceId) { (req as any).adminDevice = { isAuthority: false, permissions: [], teams: null }; next(); return; }
  try {
    const { rows } = await pool.query(
      'SELECT is_approved, is_authority, permissions, scope_teams, device_name FROM admin_devices WHERE user_id=$1 AND device_id=$2',
      [req.user.userId, req.user.deviceId]
    );
    const d = rows[0];
    if (!d || !d.is_approved) {
      res.status(401).json({ error: '기기 등록이 해제되었습니다. 다시 로그인해주세요.' });
      return;
    }
    const teams: string[] = d.scope_teams || [];
    (req as any).adminDevice = {
      isAuthority: !!d.is_authority,
      permissions: d.permissions || [],
      deviceName: d.device_name || null,
      // null = 전체 열람(권한자 / 권한팀 '전체')
      teams: (d.is_authority || teams.length === 0 || teams.includes('전체')) ? null : teams,
    };
    next();
  } catch (e) { next(e as any); }
});

// 관리자 작업 기록(감사 로그). 실패해도 본 작업에는 영향 없음.
async function logAudit(req: Request, action: string, entity: string, targetName?: string | null, detail?: string | null): Promise<void> {
  try {
    const ad = (req as any).adminDevice;
    await pool.query(
      'INSERT INTO audit_logs (admin_name, device_id, action, entity, target_name, detail) VALUES ($1,$2,$3,$4,$5,$6)',
      [ad?.deviceName || null, req.user.deviceId || null, action, entity, targetName || null, detail || null]
    );
  } catch (e: any) { console.error('[audit]', e.message); }
}

// 이 요청을 보낸 기기가 '권한자'인지 (미들웨어에서 붙인 req.adminDevice 사용)
async function reqIsAuthority(req: Request): Promise<boolean> {
  return !!(req as any).adminDevice?.isAuthority;
}

// 세부 권한 보유 여부. 권한자는 전부 허용. report_leave는 report_full이 있으면 포함.
function hasPerm(req: Request, key: string): boolean {
  const ad = (req as any).adminDevice;
  if (!ad) return false;
  if (ad.isAuthority) return true;
  const p: string[] = ad.permissions || [];
  if (key === 'report_leave') return p.includes('report_leave') || p.includes('report_full');
  return p.includes(key);
}
// 권한 없으면 403 응답 후 false 반환.
function requirePerm(req: Request, res: Response, key: string): boolean {
  if (hasPerm(req, key)) return true;
  res.status(403).json({ error: '권한이 없습니다. 권한자에게 문의하세요.' });
  return false;
}
// 라우트 미들웨어로 쓰는 권한 가드
function needPerm(key: string) {
  return (req: Request, res: Response, next: any): void => {
    if (hasPerm(req, key)) { next(); return; }
    res.status(403).json({ error: '권한이 없습니다. 권한자에게 문의하세요.' });
  };
}
const permStaff = needPerm('staff');
const permSettings = needPerm('settings');

// 로그인한 관리자 기기의 열람 범위(권한 팀). null = 전체 열람, 배열 = 해당 팀만.
async function getReadScope(req: Request): Promise<string[] | null> {
  return (req as any).adminDevice?.teams ?? null;
}

// 대상 직원이 권한 범위(권한 팀) 안인지 확인. 범위 밖이면 403 응답 후 false 반환.
async function assertWorkerInScope(req: Request, res: Response, workerId: string): Promise<boolean> {
  const scope = (req as any).adminDevice?.teams;
  if (!scope) return true; // 권한자/전체 → 제한 없음
  const { rows } = await pool.query('SELECT team FROM users WHERE id=$1', [workerId]);
  if (!rows[0] || !scope.includes(rows[0].team)) {
    res.status(403).json({ error: '권한 범위 밖 직원입니다.' }); return false;
  }
  return true;
}

// 직원 신규 등록/재활성화 시 당일 남은 랜덤 확인 슬롯을 생성한다(실패해도 등록은 진행).
async function generateTodaySlots(
  userId: string, scheduledStart?: string, scheduledEnd?: string, lunchStart?: string, lunchEnd?: string,
  irregular?: boolean,
): Promise<void> {
  if (irregular) return; // 비정기 근무자는 랜덤 확인 대상이 아니므로 생성하지 않음
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

router.post('/workplaces', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name, lat, lng, radiusM, address, postalCode, detailAddress } = req.body;
  if (!name || lat == null || lng == null) { res.status(400).json({ error: 'name, lat, lng는 필수입니다.' }); return; }
  const dup = await workplaceDupCheck(name, address);
  if (dup.name || dup.address) { res.status(409).json({ error: '중복', dup }); return; }
  const { rows } = await pool.query(
    'INSERT INTO workplaces (name, lat, lng, radius_m, address, postal_code, detail_address) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [name, lat, lng, radiusM || 500, address || null, postalCode || null, detailAddress || null]
  );
  await logAudit(req, '추가', '근무지', rows[0]?.name);
  res.status(201).json({ workplace: rows[0] });
});

router.put('/workplaces/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name, lat, lng, radiusM, address, postalCode, detailAddress } = req.body;
  const dup = await workplaceDupCheck(name, address, req.params.id);
  if (dup.name || dup.address) { res.status(409).json({ error: '중복', dup }); return; }
  const { rows } = await pool.query(
    'UPDATE workplaces SET name=$1, lat=$2, lng=$3, radius_m=$4, address=$5, postal_code=$6, detail_address=$7 WHERE id=$8 RETURNING *',
    [name, lat, lng, radiusM || 500, address || null, postalCode || null, detailAddress || null, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '근무지를 찾을 수 없습니다.' }); return; }
  res.json({ workplace: rows[0] });
});

router.delete('/workplaces/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { rows: wpd } = await pool.query('UPDATE workplaces SET is_active=FALSE WHERE id=$1 RETURNING name', [req.params.id]);
  await logAudit(req, '삭제', '근무지', wpd[0]?.name);
  res.json({ success: true });
});

// 근무지 일괄 등록 (엑셀): 주소 지오코딩 + 중복검사
router.post('/workplaces/bulk', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
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
        [name, g.lat, g.lng, parseInt(r.radiusM, 10) || 500, g.road, g.zone || null, (r.detailAddress || '').trim() || null]
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
  // 권한 범위(권한 팀) 적용: 권한자/최고관리자/'전체'가 아니면 해당 팀 직원만 열람
  const scope = await getReadScope(req);
  if (scope) { params.push(scope); conditions.push(`u.team = ANY($${params.length})`); }

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

router.post('/workers', permStaff, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, phone, position, corp, division, team, jobTitle, remark,
            scheduledStart, scheduledEnd, lunchStart, lunchEnd, workplaceId,
            noteExempt, irregularWorker, mode } = req.body; // mode: undefined | 'restore' | 'new'
    const phoneDigits = (phone || '').replace(/\D/g, '');
    if (!name || !phoneDigits) { res.status(400).json({ error: '이름과 전화번호는 필수입니다.' }); return; }
    const passwordHash = await bcrypt.hash(phoneDigits, 12); // 초기 비밀번호 = 하이픈 제외 전화번호

    // 같은 전화번호의 기존 계정 확인 (이메일로는 중복 검사하지 않음)
    const { rows: existing } = await pool.query(
      `SELECT id, is_active, deactivated_at FROM users
       WHERE regexp_replace(phone, '\\D', '', 'g') = $1
       ORDER BY is_active DESC LIMIT 1`, [phoneDigits]
    );
    const ex = existing[0];
    if (ex) {
      if (ex.is_active) { res.status(400).json({ error: '이미 등록된 전화번호입니다.' }); return; }

      // 소프트 삭제된 계정: 삭제 후 1년 이내면 복구 여부를 물어본다.
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const deactMs = ex.deactivated_at ? new Date(ex.deactivated_at).getTime() : 0;
      const withinYear = deactMs === 0 ? true : deactMs > oneYearAgo; // 시각 불명이면 보존 기간 내로 간주

      if (withinYear && mode === 'restore') {
        // '예': 보존된 기록을 살려서 재활성화 (정보 갱신 + 비번/기기/잠금 초기화)
        const { rows } = await pool.query(
          `UPDATE users SET name=$1, email=$2, position=$3, corp=$4, division=$5, team=$6, job_title=$7, remark=$8,
             scheduled_start=$9, scheduled_end=$10, lunch_start=$11, lunch_end=$12, workplace_id=$13,
             note_exempt=$14, irregular_worker=$15,
             password_hash=$16, must_change_password=TRUE, is_active=TRUE, role='worker', deactivated_at=NULL,
             device_id=NULL, device_registered_at=NULL, is_locked=FALSE, failed_login_attempts=0, locked_reason=NULL
           WHERE id=$17 RETURNING id, name`,
          [name, email || null, position || null, corp || null, division || null, team || null, jobTitle || null, remark || null,
           scheduledStart || '09:00', scheduledEnd || '18:00', lunchStart || '12:00', lunchEnd || '13:00', workplaceId || null,
           !!noteExempt, !!irregularWorker, passwordHash, ex.id]
        );
        await generateTodaySlots(rows[0].id, scheduledStart, scheduledEnd, lunchStart, lunchEnd, !!irregularWorker);
        res.status(201).json({ success: true, worker: rows[0], initPassword: phoneDigits, reactivated: true });
        return;
      }

      if (withinYear && mode !== 'new') {
        // 확인 필요: 프론트에서 복구 여부 팝업을 띄운다.
        res.status(409).json({ needsConfirm: true, phone: phoneDigits, deactivatedAt: ex.deactivated_at });
        return;
      }

      // 'new'(아니오) 또는 1년 초과 → 보존 기록을 영구 삭제하고 신규 등록으로 진행
      await pool.query('DELETE FROM users WHERE id=$1', [ex.id]); // 연관 기록 CASCADE 삭제
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
    await generateTodaySlots(rows[0].id, scheduledStart, scheduledEnd, lunchStart, lunchEnd, !!irregularWorker);
    await logAudit(req, '추가', '직원', name);
    res.status(201).json({ success: true, worker: rows[0], initPassword: phoneDigits });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 정보입니다.' });
    else res.status(500).json({ error: e.message || '직원 추가 중 오류가 발생했습니다.' });
  }
});

router.put('/workers/:id', permStaff, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await assertWorkerInScope(req, res, req.params.id))) return;
    const { name, phone, email, position, corp, division, team, jobTitle, remark,
            scheduledStart, scheduledEnd, lunchStart, lunchEnd, workplaceId,
            noteExempt, irregularWorker } = req.body;
    const { rows: prev } = await pool.query('SELECT name FROM users WHERE id=$1', [req.params.id]);
    const oldWName = prev[0]?.name;
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
    await logAudit(req, '수정', '직원', rows[0].name, (oldWName && oldWName !== rows[0].name) ? `(이름)${oldWName}->${rows[0].name}` : null);
    res.json({ success: true, worker: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message || '직원 정보 수정 중 오류가 발생했습니다.' });
  }
});

router.delete('/workers/:id', permStaff, async (req: Request, res: Response): Promise<void> => {
  if (!(await assertWorkerInScope(req, res, req.params.id))) return;
  // 소프트 삭제 + 삭제 시각 기록 (재등록 시 1년 보존 판단용)
  const { rows: delr } = await pool.query('UPDATE users SET is_active=FALSE, deactivated_at=now() WHERE id=$1 RETURNING name', [req.params.id]);
  await logAudit(req, '삭제', '직원', delr[0]?.name);
  res.json({ success: true });
});

router.put('/workers/:id/reset-password', requireAdmin, permStaff, async (req: Request, res: Response): Promise<void> => {
  const { newPassword } = req.body;
  const { rows: users } = await pool.query('SELECT id, name, phone, role FROM users WHERE id=$1 AND is_active=TRUE', [req.params.id]);
  if (!users[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  // 관리자(admin/hr) 계정의 비밀번호 변경은 권한자만 가능
  if ((users[0].role === 'admin' || users[0].role === 'hr') && !(await reqIsAuthority(req))) {
    res.status(403).json({ error: '관리자 계정의 비밀번호는 권한자만 변경할 수 있습니다.' }); return;
  }
  // 권한 범위 밖 직원은 초기화 불가
  if (!(await assertWorkerInScope(req, res, req.params.id))) return;

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
  await logAudit(req, '비번초기화', '직원', users[0].name);
  res.json({ success: true, initPassword: plain });
});

router.post('/workers/:id/reset-device', requireAdmin, permStaff, async (req: Request, res: Response): Promise<void> => {
  if (!(await assertWorkerInScope(req, res, req.params.id))) return;
  const { rows } = await pool.query(
    `UPDATE users SET device_id=NULL, device_registered_at=NULL,
       is_locked=FALSE, failed_login_attempts=0
     WHERE id=$1 AND is_active=TRUE RETURNING id, name`,
    [req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  await logAudit(req, '기기변경', '직원', rows[0].name);
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

  // 직원 전체 (권한 범위가 있으면 해당 팀만)
  const scope = await getReadScope(req);
  const { rows: workers } = await pool.query(
    `SELECT id, name, corp, division, team, job_title, scheduled_start, note_exempt, irregular_worker
     FROM users WHERE role='worker' AND is_active=TRUE
       ${scope ? 'AND team = ANY($1)' : ''}
     ORDER BY corp, division, team, name`,
    scope ? [scope] : []
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
      const k = classifyDay(recByDate[day], !!w.note_exempt);
      if (k.isLeave) continue;
      if (!k.present) {
        // 비정기 근무자는 근무일이 특정되지 않으므로 결근(출근누락/노트누락) 집계에서 제외
        if (!w.irregular_worker) { missingIn++; if (k.missingNote) missingNote++; }
        continue;
      }
      if (k.missingOut) missingOut++;
      else if (k.isLate) lateCount++;
      if (k.missingNote) missingNote++;
    }
    // 비근무일이라도 실제 출근했거나 관리자가 무엇이든 인정한 날은 근무일로 취급해 KPI 반영
    for (const r of recs) {
      if (workdays.includes(r.date)) continue;
      if (!(r.check_in_time || r.leave_type)) continue; // 활성화되지 않은 비근무일은 제외
      const k = classifyDay(r, !!w.note_exempt);
      if (k.isLeave) continue;
      if (!k.present) {
        if (!w.irregular_worker) { missingIn++; if (k.missingNote) missingNote++; }
        continue;
      }
      if (k.missingOut) missingOut++;
      else if (k.isLate) lateCount++;
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
    `SELECT u.id, u.name, u.corp, u.division, u.team, u.job_title, u.scheduled_start, u.scheduled_end, u.note_exempt, u.irregular_worker,
            w.id AS wp_id, w.name AS wp_name, w.lat AS wp_lat, w.lng AS wp_lng, w.radius_m
     FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id WHERE u.id=$1`,
    [userId]
  );
  if (!userRows[0]) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }
  const user = userRows[0];
  // 권한 범위 밖 직원 리포트 열람 차단
  const scope = await getReadScope(req);
  if (scope && !scope.includes(user.team)) { res.status(403).json({ error: '열람 권한이 없는 직원입니다.' }); return; }
  const noteExempt = !!user.note_exempt;
  const irregular = !!user.irregular_worker;

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

  // 기간 내 모든 달력 날짜(주말·공휴일 포함)를 표시한다.
  const allDays: string[] = [];
  {
    const cur = new Date(from + 'T00:00:00+09:00');
    const endDt = new Date(to + 'T00:00:00+09:00');
    while (cur <= endDt) {
      allDays.push(cur.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
      cur.setDate(cur.getDate() + 1);
    }
  }

  const buildDayEntry = (day: string) => {
    const r = recByDate[day];
    const lt = r?.leave_type;
    const isCalWorkday = workdaySet.has(day);
    // 비근무일(주말·공휴일)이라도 실제 출근했거나 관리자가 무엇이든 인정하면 근무일로 취급
    const treatWorkday = isCalWorkday || Boolean(r?.check_in_time) || Boolean(lt);

    // 근무일이 아니고 아무 기록·인정도 없으면 회색 '근무일 X'로 표시(집계 제외)
    if (!treatWorkday) return { date: day, offday: true };

    const k = classifyDay(r, noteExempt);

    if (k.isLeave) return { date: day, leaveType: '연차' };

    if (!k.present) {
      // 비정기 근무자는 결근(출근누락/노트누락) 집계에서 제외
      const countAbsent = treatWorkday && !irregular;
      if (countAbsent) { missingIn++; if (k.missingNote) missingNote++; }
      return { date: day, missing: countAbsent, noNote: countAbsent && k.missingNote };
    }

    const hasIn = Boolean(r.check_in_time);

    if (treatWorkday || hasIn) {
      if (k.missingOut)  missingOut++;
      else if (k.isLate) lateCount++;
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

  const days = allDays.map(buildDayEntry);

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

  const scope = await getReadScope(req);
  const { rows: users } = await pool.query(
    `SELECT id, note_exempt, irregular_worker FROM users WHERE role='worker' AND is_active=TRUE
       ${scope ? 'AND team = ANY($1)' : ''}`,
    scope ? [scope] : []
  );
  const ids = users.map((u: any) => u.id);
  const noteExemptById: Record<string, boolean> = {};
  const irregularById: Record<string, boolean> = {};
  for (const u of users) { noteExemptById[u.id] = !!u.note_exempt; irregularById[u.id] = !!u.irregular_worker; }
  if (!ids.length) { res.json({ scores: {} }); return; }

  const { rows: records } = await pool.query(
    `SELECT user_id, date::text AS date, check_in_time, check_out_time, status,
            work_note_today, daily_report, leave_type
     FROM attendance_records WHERE user_id=ANY($1) AND date>=$2 AND date<=$3`,
    [ids, from, to]
  );

  // user|date -> record
  const recByUD: Record<string, any> = {};
  // 비근무일이라도 실제 출근했거나 관리자가 무엇이든 인정(leave_type)한 날은 근무일로 취급
  const activatedByUser: Record<string, Set<string>> = {};
  for (const r of records) {
    recByUD[`${r.user_id}|${r.date}`] = r;
    if (!workdaySet.has(r.date) && (Boolean(r.check_in_time) || Boolean(r.leave_type))) {
      (activatedByUser[r.user_id] ||= new Set()).add(r.date);
    }
  }

  const scores: Record<string, any> = {};
  for (const uid of ids) {
    let lateCount = 0, missingIn = 0, missingOut = 0, missingNote = 0;
    const days = [...workdays, ...(activatedByUser[uid] || [])];
    for (const day of days) {
      const r = recByUD[`${uid}|${day}`];
      // 달력상 근무일이거나, 비근무일이어도 출근/인정으로 활성화된 날 → 근무일로 취급
      const treatWorkday = workdaySet.has(day) || Boolean(r?.check_in_time) || Boolean(r?.leave_type);
      const k = classifyDay(r, noteExemptById[uid]);
      if (k.isLeave) continue;
      if (!k.present) {
        // 비정기 근무자는 결근(출근누락/노트누락) 집계에서 제외
        if (treatWorkday && !irregularById[uid]) { missingIn++; if (k.missingNote) missingNote++; }
        continue;
      }
      if (treatWorkday || Boolean(r?.check_in_time)) {
        if (k.missingOut) missingOut++;
        else if (k.isLate) lateCount++;
        if (k.missingNote) missingNote++;
      }
    }
    scores[uid] = { lateCount, missingIn, missingOut, missingNote, score: lateCount + missingIn + missingOut + missingNote };
  }

  res.json({ scores });
});

// POST /api/admin/send-report — 지정 인원에게 기간 리포트 링크를 수동 발송 (이메일 우선, 없으면 문자)
router.post('/send-report', async (req: Request, res: Response): Promise<void> => {
  if (!requirePerm(req, res, 'report_leave')) return; // 개별리포트 쓰기 권한 필요
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
  // 법인별 담당자 목록 (한 담당자가 여러 법인, 한 법인에 여러 담당자 모두 지원)
  const managersByCorp: Record<string, { name: string; phone: string }[]> = {};
  for (const mr of mgrRows) {
    for (const c of String(mr.corp).split(/[,·]/).map((s: string) => s.trim()).filter(Boolean)) {
      (managersByCorp[c] ||= []).push({ name: mr.device_name || '', phone: mr.phone || '' });
    }
  }
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
        managers: managersByCorp[rep.user.corp] || [],
        senderPhone: managersByCorp[rep.user.corp]?.[0]?.phone || '',
      });
      results.push({ userId: uid, name: rep.user.name, ok: via !== 'none', via });
    } catch (e: any) {
      results.push({ userId: uid, name: rep.user.name, ok: false, reason: e.message });
    }
  }
  const sent = results.filter((r) => r.ok).length;
  await logAudit(req, '발송', '리포트', `${sent}명`, `${from}~${to}`);
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

router.post('/attendance/:recordId/set-leave', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { leaveType } = req.body; // '연차'|'출근'|'출퇴근'|'노트' 등|null
  // 연차 인정·해제 → report_leave, 출근/퇴근/노트 인정 → report_full
  if (!requirePerm(req, res, (leaveType && leaveType !== '연차') ? 'report_full' : 'report_leave')) return;
  const { rows } = await pool.query(
    `UPDATE attendance_records ar SET leave_type=$1 FROM users u
      WHERE ar.id=$2 AND u.id=ar.user_id RETURNING ar.id, u.name AS worker_name, ar.date::text AS d`,
    [leaveType || null, req.params.recordId]
  );
  if (!rows[0]) { res.status(404).json({ error: '기록을 찾을 수 없습니다.' }); return; }
  await logAudit(req, leaveType ? '인정' : '인정해제', '근태', rows[0].worker_name, leaveType ? `${leaveType} 인정(${mmdd(rows[0].d)})` : `인정 해제(${mmdd(rows[0].d)})`);
  // 인정 해제 시, 실제 기록(출근/퇴근/노트)이 없는 빈 행이면 삭제 (재출근 가능하도록)
  if (!leaveType) {
    await pool.query(
      `DELETE FROM attendance_records WHERE id=$1 AND leave_type IS NULL
         AND check_in_time IS NULL AND check_out_time IS NULL
         AND COALESCE(work_note_today,'')='' AND COALESCE(daily_report,'')=''`,
      [req.params.recordId]
    );
  }
  res.json({ success: true });
});

// POST: 날짜별 연차 생성 (기록 없을 때)
router.post('/attendance/set-leave-day', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { userId, date, leaveType } = req.body;
  if (!userId || !date) { res.status(400).json({ error: 'userId, date가 필요합니다.' }); return; }
  // 연차 인정·해제 → report_leave, 출근/퇴근/노트 인정 → report_full
  if (!requirePerm(req, res, (leaveType && leaveType !== '연차') ? 'report_full' : 'report_leave')) return;

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
    if (!leaveType) {
      // 인정 해제: 실제 기록이 없는 빈 행이면 삭제(재출근 가능), 아니면 leave_type만 해제
      const del = await pool.query(
        `DELETE FROM attendance_records WHERE id=$1
           AND check_in_time IS NULL AND check_out_time IS NULL
           AND COALESCE(work_note_today,'')='' AND COALESCE(daily_report,'')='' RETURNING id`,
        [rec.id]
      );
      if (!del.rows[0]) {
        await pool.query('UPDATE attendance_records SET leave_type=NULL WHERE id=$1', [rec.id]);
      }
    } else {
      // 체크인 없고 근무시간 없을 때만 예정 근무시간 기입
      const updateMins = scheduledMinutes !== null && !rec.check_in_time && !rec.work_minutes;
      if (updateMins) {
        await pool.query('UPDATE attendance_records SET leave_type=$1, work_minutes=$2 WHERE id=$3', [leaveType, scheduledMinutes, rec.id]);
      } else {
        await pool.query('UPDATE attendance_records SET leave_type=$1 WHERE id=$2', [leaveType, rec.id]);
      }
    }
  } else if (leaveType) {
    await pool.query(
      'INSERT INTO attendance_records (user_id, date, leave_type, work_minutes) VALUES ($1,$2,$3,$4)',
      [userId, date, leaveType, scheduledMinutes]
    );
  }
  const { rows: wn } = await pool.query('SELECT name FROM users WHERE id=$1', [userId]);
  await logAudit(req, leaveType ? '인정' : '인정해제', '근태', wn[0]?.name, leaveType ? `${leaveType} 인정(${mmdd(date)})` : `인정 해제(${mmdd(date)})`);
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

router.post('/device-change-requests/:id/approve', requireAdmin, permStaff, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query("SELECT * FROM device_change_requests WHERE id=$1 AND status='pending'", [req.params.id]);
  if (!rows[0]) { res.status(404).json({ error: '요청을 찾을 수 없습니다.' }); return; }
  await pool.query('UPDATE users SET device_id=$1, device_registered_at=now(), is_locked=FALSE, failed_login_attempts=0 WHERE id=$2',
    [rows[0].new_device_id, rows[0].user_id]);
  await pool.query("UPDATE device_change_requests SET status='approved', processed_at=now(), processed_by=$1 WHERE id=$2",
    [req.user.userId, req.params.id]);
  res.json({ success: true });
});

router.post('/device-change-requests/:id/reject', requireAdmin, permStaff, async (req: Request, res: Response): Promise<void> => {
  await pool.query("UPDATE device_change_requests SET status='rejected', processed_at=now(), processed_by=$1 WHERE id=$2 AND status='pending'",
    [req.user.userId, req.params.id]);
  res.json({ success: true });
});

// ── 계정 잠금 해제 ────────────────────────────────────────────

router.post('/users/:id/unlock', requireAdmin, permStaff, async (req: Request, res: Response): Promise<void> => {
  if (!(await assertWorkerInScope(req, res, req.params.id))) return;
  const { rows: ul } = await pool.query('UPDATE users SET is_locked=FALSE, locked_reason=NULL, failed_login_attempts=0 WHERE id=$1 RETURNING name', [req.params.id]);
  await logAudit(req, '잠금해제', '직원', ul[0]?.name);
  res.json({ success: true });
});

// ── 퇴근 시간 변경 승인 ───────────────────────────────────────

router.post('/attendance/:recordId/approve-time-change', async (req: Request, res: Response): Promise<void> => {
  if (!requirePerm(req, res, 'report_full')) return; // 출퇴근 시간변경 승인
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
  const isHolder = await reqIsAuthority(req); // 권한자만 대기 기기(승인 대상) 목록 조회
  const { rows: myDevices } = await pool.query(
    'SELECT id, device_id, device_name, corp, phone, is_approved, is_authority, permissions, scope_teams, approved_at, created_at FROM admin_devices WHERE user_id=$1 ORDER BY created_at',
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
    'SELECT id, device_id, device_name, corp, phone, is_approved, is_authority, permissions, scope_teams, approved_at, created_at FROM admin_devices WHERE user_id=$1 ORDER BY created_at',
    [req.params.userId]
  );
  res.json({ devices: rows });
});

// 기기 승인 (권한자 기기만)
router.post('/devices/:id/approve', async (req: Request, res: Response): Promise<void> => {
  if (!(await reqIsAuthority(req))) { res.status(403).json({ error: '권한자만 승인할 수 있습니다.' }); return; }
  const { rows } = await pool.query(
    'UPDATE admin_devices SET is_approved=TRUE, approved_by=$1, approved_at=now() WHERE id=$2 AND is_approved=FALSE RETURNING device_name',
    [req.user.userId, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '승인할 기기를 찾을 수 없습니다.' }); return; }
  await logAudit(req, '승인', '관리자', rows[0].device_name);
  res.json({ success: true });
});

// 기기 삭제 (권한자 기기만, 권한자 기기 자신은 삭제 불가)
router.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  if (!(await reqIsAuthority(req))) { res.status(403).json({ error: '권한자만 삭제할 수 있습니다.' }); return; }
  const { rows } = await pool.query('SELECT is_authority FROM admin_devices WHERE id=$1', [req.params.id]);
  if (!rows[0]) { res.status(404).json({ error: '기기를 찾을 수 없습니다.' }); return; }
  // 권한자 기기도 삭제 가능. 단, 마지막 권한자 기기(권한자가 1개만 남은 경우)는 삭제 불가.
  if (rows[0].is_authority) {
    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS c FROM admin_devices WHERE is_authority=TRUE');
    if (cnt[0].c <= 1) { res.status(400).json({ error: '마지막 권한자 기기는 삭제할 수 없습니다.' }); return; }
  }
  { const { rows: r } = await pool.query('DELETE FROM admin_devices WHERE id=$1 RETURNING device_name', [req.params.id]); await logAudit(req, '삭제', '관리자', r[0]?.device_name, '기기 삭제'); }
  res.json({ success: true });
});

// 기기 정보(관리자명=device_name, 업무용 전화번호, 읽기/쓰기, 권한 팀) 수정 — 최고관리자만
// 같은 관리자명을 가진 모든 기기에 함께 적용(동기화)한다.
// 관리자명을 '이미 존재하는 다른 관리자명'으로 바꾸면 두 관리자의 권한을 합집합으로 병합한다.
// (프론트에서 confirmMerge=true 확인을 받은 뒤 진행)
function normalizeTeams(input: any): string[] {
  let arr: string[];
  if (Array.isArray(input)) arr = input.map((x) => String(x).trim());
  else if (typeof input === 'string') arr = input.split(',').map((x) => x.trim());
  else arr = [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of arr) { if (t && !seen.has(t)) { seen.add(t); out.push(t); } }
  return out.length ? out : ['전체'];
}

// 권한 키 정규화(유효 키만, 중복 제거)
const VALID_PERMS = ['staff', 'report_leave', 'report_full', 'settings'];
function normalizePerms(input: any): string[] {
  const arr = Array.isArray(input) ? input.map((x) => String(x)) : [];
  return VALID_PERMS.filter((k) => arr.includes(k));
}
// 로그 비고용: 권한 키 배열 → 사람이 읽는 라벨
const PERM_LABEL: Record<string, string> = {
  staff: '직원 관리 쓰기', report_leave: '개별리포트(연차)', report_full: '개별리포트(전체)', settings: '설정 쓰기',
};
function permLabel(perms: string[]): string {
  const list = (perms || []).filter((k) => VALID_PERMS.includes(k)).map((k) => PERM_LABEL[k]);
  return list.length ? '읽기+' + list.join('+') : '읽기 전용';
}
// 'YYYY-MM-DD' → 'MM/DD'
const mmdd = (d?: string) => (d ? d.slice(5).replace('-', '/') : '');

router.put('/devices/:id/info', async (req: Request, res: Response): Promise<void> => {
  if (!(await reqIsAuthority(req))) { res.status(403).json({ error: '권한자만 수정할 수 있습니다.' }); return; }
  const { phone, confirmMerge } = req.body;
  const corp = (req.body.corp ?? '').trim() || null;   // 담당 법인(월간 리포트 발신담당 매핑에 사용)
  const newName = (req.body.deviceName ?? '').trim();
  if (!newName) { res.status(400).json({ error: '관리자명을 입력해주세요.' }); return; }
  const permissions = normalizePerms(req.body.permissions);
  const teams = normalizeTeams(req.body.teams);

  const { rows: cur } = await pool.query('SELECT device_name, permissions FROM admin_devices WHERE id=$1', [req.params.id]);
  if (!cur[0]) { res.status(404).json({ error: '기기를 찾을 수 없습니다.' }); return; }
  const oldName: string = (cur[0].device_name ?? '').trim();
  const oldPerms: string[] = cur[0].permissions || [];

  // 이름이 바뀌었고, 바꾸려는 이름을 가진 '다른 그룹' 기기가 이미 있는지
  const isRename = newName !== oldName;
  let collision = false;
  if (isRename) {
    const { rows: ex } = await pool.query(
      'SELECT 1 FROM admin_devices WHERE device_name=$1 LIMIT 1', [newName]
    );
    collision = ex.length > 0;
  }

  if (collision && !confirmMerge) {
    res.status(409).json({
      needMerge: true,
      error: '해당 관리자명은 이미 존재하여, 계속 진행할 경우 권한 범위가 변경됩니다. 계속 진행하시겠습니까?',
    });
    return;
  }

  let appliedPerms: string[] = permissions;   // 로그 비고용(적용된 최종 권한)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (collision) {
      // 병합: oldName 그룹 + newName 그룹의 권한(키·팀)을 합집합으로
      const { rows: others } = await client.query(
        'SELECT permissions, scope_teams FROM admin_devices WHERE device_name=$1', [newName]
      );
      const permSet = new Set<string>(permissions);
      const teamSet = new Set<string>(teams);
      for (const o of others) {
        for (const p of (o.permissions || [])) permSet.add(p);
        for (const t of (o.scope_teams || [])) teamSet.add(t);
      }
      const mergedPerms = VALID_PERMS.filter((k) => permSet.has(k));
      appliedPerms = mergedPerms;
      const mergedTeams = Array.from(teamSet);
      const names = oldName ? [oldName, newName] : [newName];
      await client.query(
        `UPDATE admin_devices SET device_name=$1, corp=$2, phone=$3, permissions=$4, scope_teams=$5
         WHERE device_name = ANY($6) OR id=$7`,
        [newName, corp, phone || null, mergedPerms, mergedTeams, names, req.params.id]
      );
    } else if (oldName) {
      // 같은 관리자명 그룹 전체에 동기화 (이름 변경 포함)
      await client.query(
        `UPDATE admin_devices SET device_name=$1, corp=$2, phone=$3, permissions=$4, scope_teams=$5
         WHERE device_name=$6 OR id=$7`,
        [newName, corp, phone || null, permissions, teams, oldName, req.params.id]
      );
    } else {
      // 기존 이름이 비어 있으면 이 기기 1개만 설정
      await client.query(
        `UPDATE admin_devices SET device_name=$1, corp=$2, phone=$3, permissions=$4, scope_teams=$5 WHERE id=$6`,
        [newName, corp, phone || null, permissions, teams, req.params.id]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const parts: string[] = [];
  if (oldName && newName !== oldName) parts.push(`(이름)${oldName}->${newName}`);
  const oldPL = permLabel(oldPerms), newPL = permLabel(appliedPerms);
  if (oldPL !== newPL) parts.push(`(권한)${oldPL}->${newPL}`);
  await logAudit(req, '수정', '관리자', newName, parts.join(', ') || null);
  res.json({ success: true, merged: collision });
});

// 기기 추가 초대(+버튼) — 권한자/최고관리자만. 등록 링크를 이메일 AND 문자로 발송한다.
// 링크를 '등록하려는 기기'에서 열면 공용 관리자 계정에 그 기기가 등록된다.
router.post('/devices/invite', async (req: Request, res: Response): Promise<void> => {
  if (!(await reqIsAuthority(req))) { res.status(403).json({ error: '권한자만 기기를 추가할 수 있습니다.' }); return; }
  const managerName = (req.body.managerName ?? '').trim();
  const email = (req.body.email ?? '').trim() || null;
  const phone = (req.body.phone ?? '').trim() || null;
  const corp = (req.body.corp ?? '').trim() || null;
  if (!managerName) { res.status(400).json({ error: '관리자명을 입력해주세요.' }); return; }
  if (!email && !phone) { res.status(400).json({ error: '이메일 또는 전화번호를 입력해주세요.' }); return; }
  const permissions = normalizePerms(req.body.permissions);
  const teams = normalizeTeams(req.body.teams);

  // 이미 존재하는 관리자명이면 확인 필요(등록 시 기존 권한을 상속 → 입력한 권한범위는 무시됨)
  if (req.body.confirmMerge !== true) {
    const { rows: dup } = await pool.query('SELECT 1 FROM admin_devices WHERE device_name=$1 LIMIT 1', [managerName]);
    if (dup.length > 0) {
      res.status(409).json({
        needConfirm: true,
        error: '해당 관리자명은 이미 존재하여, 계속 진행할 경우 권한 범위가 변경됩니다. 계속 진행하시겠습니까?',
      });
      return;
    }
  }

  // nonce: 1회용 링크 식별자(한 초대로 기기 하나만 등록)
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const token = jwt.sign(
    { purpose: 'admin-device-invite', uid: req.user.userId, managerName, email, phone, corp, permissions, teams, nonce },
    process.env.JWT_SECRET as string, { expiresIn: '7d' }
  );
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const link = `${base}/admin/register-device?t=${encodeURIComponent(token)}`;
  // 발신번호: 033-340-0024 (SMS_SENDER 미설정 시에도 고정)
  const senderPhone = process.env.SMS_SENDER || '0333400024';
  try {
    const sent = await sendAdminDeviceInvite({ name: managerName, email, phone, link, senderPhone });
    if (!sent.email && !sent.sms) { res.status(502).json({ error: '이메일/문자 발송에 실패했습니다. 발송 설정을 확인하세요.' }); return; }
    await logAudit(req, '초대', '관리자', managerName, '기기 등록 링크 발송');
    res.json({ success: true, sent });
  } catch (e: any) {
    res.status(502).json({ error: `발송 실패: ${e.message}` });
  }
});

// 권한자 이전 (현재 권한자 기기 → 대상 기기). 이전 후에는 재로그인 시 반영.
router.put('/authority/transfer', async (req: Request, res: Response): Promise<void> => {
  if (!(await reqIsAuthority(req))) { res.status(403).json({ error: '권한자만 이전할 수 있습니다.' }); return; }
  const { targetDeviceId } = req.body; // admin_devices.id
  if (!targetDeviceId) { res.status(400).json({ error: 'targetDeviceId가 필요합니다.' }); return; }
  const { rows: target } = await pool.query(
    'SELECT id FROM admin_devices WHERE id=$1 AND is_approved=TRUE', [targetDeviceId]
  );
  if (!target[0]) { res.status(400).json({ error: '승인된 대상 기기를 찾을 수 없습니다.' }); return; }
  // '변경'을 누른 본인 기기의 권한자만 대상 기기로 넘긴다(다른 권한자는 그대로 유지 → 권한자 수 보존).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE admin_devices SET is_authority=FALSE WHERE user_id=$1 AND device_id=$2',
      [req.user.userId, req.user.deviceId]);
    await client.query('UPDATE admin_devices SET is_authority=TRUE WHERE id=$1', [targetDeviceId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const { rows: tn } = await pool.query('SELECT device_name FROM admin_devices WHERE id=$1', [targetDeviceId]);
  await logAudit(req, '권한자변경', '관리자', tn[0]?.device_name);
  res.json({ success: true });
});

// ── 발송 메시지 템플릿 (문자/이메일/푸시 제목·내용) ──────────
router.get('/message-templates', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'SELECT key, label, subject, body, placeholders, updated_at FROM message_templates ORDER BY key'
  );
  res.json({ templates: rows });
});

router.put('/message-templates/:key', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { subject, body } = req.body;
  const { rows } = await pool.query(
    `UPDATE message_templates SET subject=$1, body=$2, updated_at=now() WHERE key=$3
     RETURNING key, label, subject, body, placeholders`,
    [subject ?? '', body ?? '', req.params.key]
  );
  if (!rows[0]) { res.status(404).json({ error: '템플릿을 찾을 수 없습니다.' }); return; }
  invalidateTemplateCache();
  await logAudit(req, '수정', '메시지', rows[0]?.label);
  res.json({ success: true, template: rows[0] });
});

// ── 설정 (회사 지오펜스 — 레거시, 근무지로 대체 권장) ──────────

router.get('/company-settings', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT * FROM company_settings ORDER BY id LIMIT 1');
  res.json({ settings: rows[0] || null });
});

router.post('/company-settings', permSettings, async (req: Request, res: Response): Promise<void> => {
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

router.post('/holidays', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { date, name } = req.body;
  if (!date) { res.status(400).json({ error: 'date는 필수입니다.' }); return; }
  const { rows } = await pool.query(
    'INSERT INTO public_holidays (date, name) VALUES ($1,$2) ON CONFLICT (date) DO UPDATE SET name=EXCLUDED.name RETURNING id, date::text AS date, name',
    [date, name || '']
  );
  const all = await pool.query('SELECT date::text AS date FROM public_holidays');
  refreshHolidayCache(all.rows.map((r: any) => r.date));
  await logAudit(req, '추가', '공휴일', rows[0]?.name);
  res.status(201).json({ holiday: rows[0] });
});

router.delete('/holidays/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  { const { rows: r } = await pool.query('DELETE FROM public_holidays WHERE id=$1 RETURNING name', [req.params.id]); await logAudit(req, '삭제', '공휴일', r[0]?.name); }
  const all = await pool.query('SELECT date::text AS date FROM public_holidays');
  refreshHolidayCache(all.rows.map((r: any) => r.date));
  res.json({ success: true });
});

// ── 조직 마스터: 법인 ────────────────────────────────────────────────────────
router.get('/corporations', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT id, name, address FROM corporations ORDER BY name');
  res.json({ corporations: rows });
});
router.post('/corporations', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name, address } = req.body;
  if (!name) { res.status(400).json({ error: '법인명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query(
      'INSERT INTO corporations (name, address) VALUES ($1,$2) RETURNING id, name, address',
      [name, address || null]
    );
    await logAudit(req, '추가', '법인', rows[0]?.name);
    res.status(201).json({ corporation: rows[0] });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 법인명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.delete('/corporations/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  { const { rows: r } = await pool.query('DELETE FROM corporations WHERE id=$1 RETURNING name', [req.params.id]); await logAudit(req, '삭제', '법인', r[0]?.name); }
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
router.post('/divisions', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name, teams } = req.body;
  if (!name) { res.status(400).json({ error: '본부명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query('INSERT INTO divisions (name) VALUES ($1) RETURNING id, name', [name]);
    const div = rows[0];
    const teamNames: string[] = Array.isArray(teams) ? teams.filter((t: string) => t && t.trim()) : [];
    for (const tn of teamNames) {
      await pool.query('INSERT INTO teams (division_id, name) VALUES ($1,$2) ON CONFLICT (division_id, name) DO NOTHING', [div.id, tn.trim()]);
    }
    await logAudit(req, '추가', '본부', div?.name);
    res.status(201).json({ division: div });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 본부명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.delete('/divisions/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  { const { rows: r } = await pool.query('DELETE FROM divisions WHERE id=$1 RETURNING name', [req.params.id]); await logAudit(req, '삭제', '본부', r[0]?.name); } // 팀은 CASCADE 삭제
  res.json({ success: true });
});
// 권한 부여 대상 선택용 관리자 목록(승인된 기기의 관리자명, 중복 제거)
router.get('/managers', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT device_name AS name, bool_or(is_authority) AS is_authority
       FROM admin_devices
      WHERE device_name IS NOT NULL AND device_name <> '' AND is_approved = TRUE
      GROUP BY device_name ORDER BY device_name`
  );
  res.json({ managers: rows });
});

// 팀 단건 추가 (기존 본부에) — grantTo로 지정한 관리자(들)의 권한 팀에 새 팀을 추가한다.
router.post('/divisions/:id/teams', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;
  const grantTo: string[] = Array.isArray(req.body.grantTo) ? req.body.grantTo : [];
  if (!name) { res.status(400).json({ error: '팀명은 필수입니다.' }); return; }
  const teamName = name.trim();
  try {
    const { rows } = await pool.query(
      'INSERT INTO teams (division_id, name) VALUES ($1,$2) RETURNING id, division_id, name',
      [req.params.id, teamName]
    );
    // 선택한 관리자들의 권한 팀에 새 팀 추가('전체' 보유자는 이미 전부 열람하므로 제외)
    if (grantTo.length > 0) {
      await pool.query(
        `UPDATE admin_devices
            SET scope_teams = ARRAY(SELECT DISTINCT unnest(scope_teams || ARRAY[$1]))
          WHERE device_name = ANY($2) AND NOT ('전체' = ANY(scope_teams))`,
        [teamName, grantTo]
      );
    }
    await logAudit(req, '추가', '팀', rows[0]?.name);
    res.status(201).json({ team: rows[0] });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 팀명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.delete('/teams/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  { const { rows: r } = await pool.query('DELETE FROM teams WHERE id=$1 RETURNING name', [req.params.id]); await logAudit(req, '삭제', '팀', r[0]?.name); }
  res.json({ success: true });
});

// ── 조직 마스터: 직책 ────────────────────────────────────────────────────────
router.get('/positions', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT id, name FROM positions ORDER BY name');
  res.json({ positions: rows });
});
// 여러 개 동시 추가 가능
router.post('/positions', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
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
  await logAudit(req, '추가', '직책', added.map((p: any) => p.name).join(', '));
  res.status(201).json({ positions: added });
});
router.delete('/positions/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  { const { rows: r } = await pool.query('DELETE FROM positions WHERE id=$1 RETURNING name', [req.params.id]); await logAudit(req, '삭제', '직책', r[0]?.name); }
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
router.post('/job-schedules', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name, workStart, workEnd, breakStart, breakEnd } = req.body;
  if (!name) { res.status(400).json({ error: '직무명은 필수입니다.' }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO job_schedules (name, work_start, work_end, break_start, break_end)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name`,
      [name, workStart || '09:00', workEnd || '18:00', breakStart || '12:00', breakEnd || '13:00']
    );
    await logAudit(req, '추가', '근무시간', rows[0]?.name);
    res.status(201).json({ jobSchedule: rows[0] });
  } catch (e: any) {
    if (e.code === '23505') res.status(400).json({ error: '이미 등록된 직무명입니다.' });
    else res.status(500).json({ error: e.message });
  }
});
router.put('/job-schedules/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  const { name, workStart, workEnd, breakStart, breakEnd } = req.body;
  const { rows } = await pool.query(
    `UPDATE job_schedules SET name=$1, work_start=$2, work_end=$3, break_start=$4, break_end=$5
     WHERE id=$6 RETURNING id, name`,
    [name, workStart, workEnd, breakStart, breakEnd, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '직무를 찾을 수 없습니다.' }); return; }
  res.json({ jobSchedule: rows[0] });
});
router.delete('/job-schedules/:id', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
  { const { rows: r } = await pool.query('DELETE FROM job_schedules WHERE id=$1 RETURNING name', [req.params.id]); await logAudit(req, '삭제', '근무시간', r[0]?.name); }
  res.json({ success: true });
});

// ── 일괄 등록: 공휴일 ─────────────────────────────────────────────────────────
router.post('/holidays/bulk', requireAdmin, permSettings, async (req: Request, res: Response): Promise<void> => {
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
router.post('/workers/bulk', requireAdmin, permStaff, async (req: Request, res: Response): Promise<void> => {
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
      // 전화번호로만 매칭 (이메일 중복검사 안 함). 삭제된 계정이면 자동 복구.
      const { rows: existing } = await pool.query(
        `SELECT id, is_active FROM users WHERE regexp_replace(phone,'\\D','','g')=$1 ORDER BY is_active DESC LIMIT 1`, [phoneDigits]);
      if (existing[0] && existing[0].is_active) { failed.push({ ...info, reason: '이미 등록된 전화번호' }); continue; }
      if (existing[0]) {
        await pool.query(
          `UPDATE users SET name=$1, email=$2, position=$3, corp=$4, division=$5, team=$6, job_title=$7, remark=$8,
             scheduled_start=$9, scheduled_end=$10, lunch_start=$11, lunch_end=$12, workplace_id=$13,
             note_exempt=$14, irregular_worker=$15, password_hash=$16, must_change_password=TRUE, is_active=TRUE, role='worker', deactivated_at=NULL,
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

// 권한 범위 밖 인원 검색 감지: 이름으로 검색했을 때, 존재하지만 내 권한 팀 밖이라 볼 수 없는 직원명을 반환.
// (어느 화면이든 '열람 권한이 없습니다' 안내를 띄우기 위함)
router.get('/worker-access-check', async (req: Request, res: Response): Promise<void> => {
  const name = ((req.query.name as string) || '').trim();
  if (!name) { res.json({ blocked: [] }); return; }
  const scope = await getReadScope(req);
  if (!scope) { res.json({ blocked: [] }); return; }   // 권한자/전체는 제한 없음
  const { rows } = await pool.query(
    `SELECT DISTINCT u.name FROM users u
      WHERE u.is_active=TRUE AND u.role='worker' AND u.name ILIKE $1
        AND (u.team IS NULL OR NOT (u.team = ANY($2)))`,
    [`%${name}%`, scope]
  );
  res.json({ blocked: rows.map((r: any) => r.name) });
});

// 현재 로그인 기기의 최신 권한(권한자/세부권한) — 재로그인 없이 새로고침으로 반영하기 위함
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const ad = (req as any).adminDevice || {};
  res.json({ isAuthorityHolder: !!ad.isAuthority, permissions: ad.permissions || [] });
});

// ── 작업 기록(감사 로그) 조회 — 권한자만 ───────────────────────────────────────
router.get('/logs', async (req: Request, res: Response): Promise<void> => {
  if (!(await reqIsAuthority(req))) { res.status(403).json({ error: '권한자만 조회할 수 있습니다.' }); return; }
  const { from, to, admin, worker } = req.query as Record<string, string>;
  const conds: string[] = [];
  const params: unknown[] = [];
  if (from)   { params.push(from);         conds.push(`(created_at AT TIME ZONE 'Asia/Seoul')::date >= $${params.length}::date`); }
  if (to)     { params.push(to);           conds.push(`(created_at AT TIME ZONE 'Asia/Seoul')::date <= $${params.length}::date`); }
  if (admin)  { params.push(`%${admin}%`); conds.push(`admin_name ILIKE $${params.length}`); }
  if (worker) { params.push(`%${worker}%`);conds.push(`target_name ILIKE $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS at,
            admin_name, action, entity, target_name, detail
       FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 1000`,
    params
  );
  res.json({ logs: rows });
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
  // 권한 범위(권한 팀) 적용 — 전체현황도 직원관리/개별리포트와 동일하게 필터
  const scope = await getReadScope(req);
  if (scope) { params.push(scope); conds.push(`u.team = ANY($${params.length})`); }
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

      // 근무일 판정: 비근무일이어도 실제 출근했거나 관리자가 무엇이든 인정(leave_type)하면 근무일로 취급
      const activated = present || !!lt;
      const workday = w.irregular_worker ? activated : ((!isWeekend && !isHol) || activated);

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

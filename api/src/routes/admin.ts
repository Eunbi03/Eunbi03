import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool';
import { requireAuth, requireAdmin, requireHR } from '../middleware/auth';
import { isWithinRadius } from '../utils/geo';
import { workdaysBetween } from '../utils/holidays';

const router = Router();
router.use(requireAuth, requireAdmin);

// ── 근무지(Workplaces) CRUD ─────────────────────────────────────

router.get('/workplaces', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'SELECT id, name, lat, lng, radius_m, is_active, created_at FROM workplaces WHERE is_active=TRUE ORDER BY name'
  );
  res.json({ workplaces: rows });
});

router.post('/workplaces', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, lat, lng, radiusM } = req.body;
  if (!name || lat == null || lng == null) { res.status(400).json({ error: 'name, lat, lng는 필수입니다.' }); return; }
  const { rows } = await pool.query(
    'INSERT INTO workplaces (name, lat, lng, radius_m) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, lat, lng, radiusM || 200]
  );
  res.status(201).json({ workplace: rows[0] });
});

router.put('/workplaces/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { name, lat, lng, radiusM } = req.body;
  const { rows } = await pool.query(
    'UPDATE workplaces SET name=$1, lat=$2, lng=$3, radius_m=$4 WHERE id=$5 RETURNING *',
    [name, lat, lng, radiusM || 200, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '근무지를 찾을 수 없습니다.' }); return; }
  res.json({ workplace: rows[0] });
});

router.delete('/workplaces/:id', requireHR, async (req: Request, res: Response): Promise<void> => {
  await pool.query('UPDATE workplaces SET is_active=FALSE WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// ── 직원 관리 ──────────────────────────────────────────────────

router.get('/workers', async (req: Request, res: Response): Promise<void> => {
  const { corp, division, team, jobTitle, page = '1', limit = '200' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(500, parseInt(limit as string, 10) || 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ["u.is_active=TRUE", "u.role IN ('worker','admin','hr')"];
  const params: unknown[] = [];
  if (corp)     { params.push(corp);     conditions.push(`u.corp=$${params.length}`); }
  if (division) { params.push(division); conditions.push(`u.division=$${params.length}`); }
  if (team)     { params.push(team);     conditions.push(`u.team=$${params.length}`); }
  if (jobTitle) { params.push(jobTitle); conditions.push(`u.job_title=$${params.length}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) as count FROM users u ${where}`, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limitNum, offset);
  const { rows } = await pool.query(
    `SELECT u.id, u.employee_id, u.corp, u.division, u.team, u.job_title, u.name, u.phone,
            u.workplace_id, w.name AS workplace_name, w.lat AS wp_lat, w.lng AS wp_lng,
            u.scheduled_start, u.scheduled_end, u.lunch_start, u.lunch_end,
            u.email, u.device_id, u.is_locked, u.must_change_password, u.role, u.created_at
     FROM users u LEFT JOIN workplaces w ON u.workplace_id = w.id
     ${where} ORDER BY u.role DESC, u.corp NULLS LAST, u.division NULLS LAST, u.team NULLS LAST, u.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ workers: rows, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
});

router.post('/workers', async (req: Request, res: Response): Promise<void> => {
  const { email, name, phone, corp, division, team, jobTitle, employeeId,
          scheduledStart, scheduledEnd, lunchStart, lunchEnd, workplaceId } = req.body;
  if (!email || !name) { res.status(400).json({ error: 'email, name은 필수입니다.' }); return; }
  // 초기 비번: 전화번호 전체 (없으면 기본값)
  const initPw = (phone || '').replace(/\D/g, '') || '초기비밀번호1';
  const passwordHash = await bcrypt.hash(initPw, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (email, employee_id, password_hash, name, phone,
       corp, division, team, job_title, scheduled_start, scheduled_end,
       lunch_start, lunch_end, workplace_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, email, name`,
    [email, employeeId || null, passwordHash, name, phone || null,
     corp || null, division || null, team || null, jobTitle || null,
     scheduledStart || '09:00', scheduledEnd || '18:00',
     lunchStart || '12:00', lunchEnd || '13:00', workplaceId || null]
  );
  res.status(201).json({ success: true, worker: rows[0], initPassword: initPw });
});

router.put('/workers/:id', async (req: Request, res: Response): Promise<void> => {
  const { name, phone, corp, division, team, jobTitle, employeeId,
          scheduledStart, scheduledEnd, lunchStart, lunchEnd, workplaceId } = req.body;
  const { rows } = await pool.query(
    `UPDATE users SET name=$1, phone=$2, corp=$3, division=$4, team=$5, job_title=$6,
       employee_id=$7, scheduled_start=$8, scheduled_end=$9,
       lunch_start=$10, lunch_end=$11, workplace_id=$12
     WHERE id=$13 RETURNING id, name, email`,
    [name, phone || null, corp || null, division || null, team || null, jobTitle || null,
     employeeId || null, scheduledStart || '09:00', scheduledEnd || '18:00',
     lunchStart || '12:00', lunchEnd || '13:00', workplaceId || null, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, worker: rows[0] });
});

router.delete('/workers/:id', async (req: Request, res: Response): Promise<void> => {
  await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.put('/workers/:id/reset-password', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) { res.status(400).json({ error: '새 비밀번호를 입력해주세요. (4자 이상)' }); return; }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const { rows } = await pool.query(
    'UPDATE users SET password_hash=$1, must_change_password=TRUE WHERE id=$2 AND is_active=TRUE RETURNING id, name',
    [passwordHash, req.params.id]
  );
  if (!rows[0]) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
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
    `SELECT ar.user_id, ar.date, ar.check_in_time, ar.check_out_time,
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
    for (const day of workdays) {
      const r = recByDate[day];
      if (!r || (!r.check_in_time && !r.leave_type)) { missingIn++; continue; }
      if (r.leave_type) continue; // 연차/반차 제외
      if (r.status === '지각' || r.status === '지각조퇴') lateCount++;
      if (!r.check_out_time) missingOut++;
      if (!r.work_note_today && !r.daily_report) missingNote++;
    }
    const total = lateCount + missingIn + missingOut + missingNote;
    return { ...w, lateCount, missingIn, missingOut, missingNote, total };
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
    `SELECT ar.*, ar.work_note_in, ar.work_note_out, ar.work_note_field, ar.work_note_today,
            ar.check_in_distance_m, ar.check_out_distance_m, ar.leave_type
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
    `SELECT * FROM random_location_checks WHERE user_id=$1 AND date>=$2 AND date<=$3 ORDER BY scheduled_time`,
    [userId, from, to]
  );

  const recByDate: Record<string, any> = {};
  for (const r of records) recByDate[r.date] = r;
  const outByRecId: Record<string, any[]> = {};
  for (const o of outings) (outByRecId[o.attendance_record_id] ||= []).push(o);
  const rcByDate: Record<string, any[]> = {};
  for (const rc of randomChecks) (rcByDate[rc.date] ||= []).push(rc);

  let lateCount = 0, missingIn = 0, missingOut = 0, missingNote = 0;

  const days = workdays.map((day) => {
    const r = recByDate[day];
    if (!r) {
      missingIn++;
      return { date: day, missing: true };
    }
    if (r.leave_type) return { date: day, leaveType: r.leave_type };

    const isLate = r.status === '지각' || r.status === '지각조퇴';
    const noOut  = !r.check_out_time;
    const noNote = !r.work_note_today && !r.daily_report;

    if (isLate) lateCount++;
    if (noOut)  missingOut++;
    if (noNote) missingNote++;

    return {
      date: day,
      checkIn: { time: r.check_in_time, lat: r.check_in_lat, lng: r.check_in_lng, distanceM: r.check_in_distance_m, note: r.work_note_in },
      checkOut: r.check_out_time ? { time: r.check_out_time, lat: r.check_out_lat, lng: r.check_out_lng, distanceM: r.check_out_distance_m, isField: r.check_out_is_field, note: r.work_note_out } : null,
      status: r.status,
      workMinutes: r.work_minutes,
      isLate,
      noOut,
      noNote,
      noteField: r.work_note_field,
      noteToday: r.work_note_today || r.daily_report,
      outings: (outByRecId[r.id] || []),
      randomChecks: (rcByDate[day] || []),
    };
  });

  res.json({
    user,
    period: { from, to },
    kpi: { lateCount, missingIn, missingOut, missingNote },
    days,
  });
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
  const { rows: existing } = await pool.query(
    'SELECT id FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]
  );
  if (existing.length > 0) {
    await pool.query('UPDATE attendance_records SET leave_type=$1 WHERE id=$2', [leaveType || null, existing[0].id]);
  } else {
    await pool.query(
      'INSERT INTO attendance_records (user_id, date, leave_type) VALUES ($1,$2,$3)',
      [userId, date, leaveType || null]
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

export default router;

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool';
import { requireAuth, requireAdmin, requireHR } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireAdmin);

// GET /api/admin/workers?corp=&team=&page=1&limit=50
router.get('/workers', async (req: Request, res: Response): Promise<void> => {
  const { corp, team, department, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(200, parseInt(limit as string, 10) || 50);
  const offset = (pageNum - 1) * limitNum;

  const conditions = ["role IN ('worker','admin','hr')"];
  const params: unknown[] = [];
  if (corp) { params.push(corp); conditions.push(`corp = $${params.length}`); }
  if (team) { params.push(team); conditions.push(`team = $${params.length}`); }
  if (department) { params.push(department); conditions.push(`department = $${params.length}`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) as count FROM users ${where}`, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limitNum, offset);
  const { rows } = await pool.query(
    `SELECT u.id, u.employee_id, u.corp, u.team, u.department, u.name, u.work_type,
            w.name AS workplace_name, u.scheduled_start, u.scheduled_end,
            u.lunch_start, u.lunch_end, u.email, u.device_id, u.is_locked,
            u.must_change_password, u.role, u.created_at
     FROM users u LEFT JOIN workplaces w ON u.workplace_id = w.id
     ${where} ORDER BY u.corp, u.team, u.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json({ workers: rows, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
});

// POST /api/admin/workers — 직원 생성
router.post('/workers', async (req: Request, res: Response): Promise<void> => {
  const { email, name, role = 'worker', corp, team, department, employeeId, scheduledStart, scheduledEnd, lunchStart, lunchEnd, workType, workplaceId, initialPassword } = req.body;
  if (!email || !name) { res.status(400).json({ error: 'email, name은 필수입니다.' }); return; }
  const passwordHash = await bcrypt.hash(initialPassword || '초기비밀번호1234', 12);
  const { rows } = await pool.query(
    `INSERT INTO users (email, employee_id, password_hash, name, role, corp, team, department,
       scheduled_start, scheduled_end, lunch_start, lunch_end, work_type, workplace_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, email, name, role`,
    [email, employeeId || null, passwordHash, name, role, corp || null, team || null, department || null,
     scheduledStart || '09:00', scheduledEnd || '18:00', lunchStart || '12:00', lunchEnd || '13:00',
     workType || null, workplaceId || null]
  );
  res.status(201).json({ success: true, worker: rows[0] });
});

// PUT /api/admin/workers/:id — 직원 수정
router.put('/workers/:id', async (req: Request, res: Response): Promise<void> => {
  const { name, corp, team, department, employeeId, scheduledStart, scheduledEnd, lunchStart, lunchEnd, workType, workplaceId, role } = req.body;
  const { rows } = await pool.query(
    `UPDATE users SET name=$1, corp=$2, team=$3, department=$4, employee_id=$5,
       scheduled_start=$6, scheduled_end=$7, lunch_start=$8, lunch_end=$9,
       work_type=$10, workplace_id=$11, role=$12
     WHERE id=$13 RETURNING id, name, email`,
    [name, corp || null, team || null, department || null, employeeId || null,
     scheduledStart || '09:00', scheduledEnd || '18:00', lunchStart || '12:00', lunchEnd || '13:00',
     workType || null, workplaceId || null, role || 'worker', req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, worker: rows[0] });
});

// DELETE /api/admin/workers/:id — 직원 비활성화
router.delete('/workers/:id', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'UPDATE users SET is_active=FALSE WHERE id=$1 RETURNING id', [req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// GET /api/admin/attendance?corp=&team=&date=&page=1&limit=50
router.get('/attendance', async (req: Request, res: Response): Promise<void> => {
  const { corp, team, department, date, from, to, employeeId, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(200, parseInt(limit as string, 10) || 50);
  const offset = (pageNum - 1) * limitNum;

  const targetDate = date as string || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const conditions: string[] = ["u.role = 'worker'"];
  const params: unknown[] = [];

  if (from) { params.push(from); conditions.push(`ar.date >= $${params.length}`); }
  else if (date) { params.push(targetDate); conditions.push(`ar.date = $${params.length}`); }
  if (to) { params.push(to); conditions.push(`ar.date <= $${params.length}`); }
  if (corp) { params.push(corp); conditions.push(`u.corp = $${params.length}`); }
  if (team) { params.push(team); conditions.push(`u.team = $${params.length}`); }
  if (department) { params.push(department); conditions.push(`u.department = $${params.length}`); }
  if (employeeId) { params.push(employeeId); conditions.push(`u.employee_id = $${params.length}`); }

  const baseQuery = `FROM users u JOIN attendance_records ar ON ar.user_id = u.id WHERE ${conditions.join(' AND ')}`;
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) as count ${baseQuery}`, params);
  const total = parseInt(countRows[0].count, 10);

  params.push(limitNum, offset);
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.corp, u.team, u.department,
            ar.id AS record_id, ar.check_in_time, ar.check_in_lat, ar.check_in_lng,
            ar.check_out_time, ar.check_out_lat, ar.check_out_lng, ar.check_out_is_field,
            ar.status, ar.work_minutes, ar.daily_report, ar.tomorrow_plan, ar.report_locked,
            ar.temp_time_change_status, ar.temp_time_change_requested_end, ar.temp_time_change_reason
     ${baseQuery} ORDER BY u.corp, u.team, u.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const recordIds = rows.map((r: any) => r.record_id);
  const userIds = rows.map((r: any) => r.user_id);
  const outings = recordIds.length
    ? (await pool.query(`SELECT attendance_record_id, destination, reason, start_time, start_lat, start_lng, end_time FROM outing_records WHERE attendance_record_id = ANY($1)`, [recordIds])).rows
    : [];
  const randomChecks = userIds.length && (date || (!from && !to))
    ? (await pool.query(`SELECT user_id, scheduled_time, submitted_time, lat, lng, is_within_radius, mock_location_detected FROM random_location_checks WHERE user_id = ANY($1) AND date = $2`, [userIds, targetDate])).rows
    : [];

  const records = rows.map((r: any) => ({
    userId: r.user_id, name: r.name, corp: r.corp, team: r.team, department: r.department,
    checkIn: { time: r.check_in_time, lat: r.check_in_lat, lng: r.check_in_lng },
    checkOut: { time: r.check_out_time, lat: r.check_out_lat, lng: r.check_out_lng, isField: r.check_out_is_field },
    status: r.status, workMinutes: r.work_minutes,
    isLate: r.status === '지각' || r.status === '지각조퇴',
    isEarlyLeave: r.status === '조퇴' || r.status === '지각조퇴',
    dailyReport: r.daily_report, tomorrowPlan: r.tomorrow_plan, reportLocked: r.report_locked,
    timeChangeStatus: r.temp_time_change_status, timeChangeRequestedEnd: r.temp_time_change_requested_end,
    outings: outings.filter((o: any) => o.attendance_record_id === r.record_id),
    randomChecks: randomChecks.filter((c: any) => c.user_id === r.user_id),
  }));

  res.json({ date: targetDate, records, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
});

// GET /api/admin/attendance/export — CSV 내보내기
router.get('/attendance/export', async (req: Request, res: Response): Promise<void> => {
  const { corp, team, department, from, to } = req.query;
  const conditions: string[] = ["u.role = 'worker'"];
  const params: unknown[] = [];

  if (from) { params.push(from); conditions.push(`ar.date >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`ar.date <= $${params.length}`); }
  if (corp) { params.push(corp); conditions.push(`u.corp = $${params.length}`); }
  if (team) { params.push(team); conditions.push(`u.team = $${params.length}`); }
  if (department) { params.push(department); conditions.push(`u.department = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT u.employee_id, u.name, u.corp, u.team, u.department, ar.date,
            TO_CHAR(ar.check_in_time AT TIME ZONE 'Asia/Seoul','HH24:MI:SS') AS check_in,
            TO_CHAR(ar.check_out_time AT TIME ZONE 'Asia/Seoul','HH24:MI:SS') AS check_out,
            ROUND(ar.work_minutes::numeric, 0) AS work_minutes, ar.status,
            ar.check_in_lat, ar.check_in_lng, ar.check_out_lat, ar.check_out_lng
     FROM users u JOIN attendance_records ar ON ar.user_id = u.id
     WHERE ${conditions.join(' AND ')} ORDER BY ar.date DESC, u.name`,
    params
  );

  const filename = `attendance_${from || 'all'}_${to || 'all'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write('﻿'); // BOM for Excel

  const headers = ['사원번호', '이름', '법인', '팀', '부서', '날짜', '출근시간', '퇴근시간', '근무시간(분)', '상태', '출근위도', '출근경도', '퇴근위도', '퇴근경도'];
  res.write(headers.join(',') + '\n');

  for (const r of rows) {
    const csvRow = [
      r.employee_id || '', r.name, r.corp || '', r.team || '', r.department || '', r.date,
      r.check_in || '', r.check_out || '', r.work_minutes !== null ? String(r.work_minutes) : '',
      r.status || '',
      r.check_in_lat !== null ? String(r.check_in_lat) : '',
      r.check_in_lng !== null ? String(r.check_in_lng) : '',
      r.check_out_lat !== null ? String(r.check_out_lat) : '',
      r.check_out_lng !== null ? String(r.check_out_lng) : '',
    ].map((v) => {
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    });
    res.write(csvRow.join(',') + '\n');
  }
  res.end();
});

// GET /api/admin/attendance/history?userId=&yearMonth=2026-06
router.get('/attendance/history', async (req: Request, res: Response): Promise<void> => {
  const { userId, yearMonth } = req.query;
  if (!userId || !yearMonth) { res.status(400).json({ error: 'userId, yearMonth가 필요합니다.' }); return; }
  const { rows } = await pool.query(
    `SELECT date, check_in_time, check_out_time, status, work_minutes
     FROM attendance_records WHERE user_id=$1 AND to_char(date,'YYYY-MM')=$2 ORDER BY date`,
    [userId, yearMonth]
  );
  res.json({ days: rows });
});

// GET /api/admin/monthly-reports?yearMonth=&corp=&team=
router.get('/monthly-reports', async (req: Request, res: Response): Promise<void> => {
  const { yearMonth, corp, team } = req.query;
  const targetYM = (yearMonth as string) || new Date().toISOString().slice(0, 7);
  const conditions = ["mr.year_month=$1", "u.role='worker'"];
  const params: unknown[] = [targetYM];
  if (corp) { params.push(corp); conditions.push(`u.corp=$${params.length}`); }
  if (team) { params.push(team); conditions.push(`u.team=$${params.length}`); }
  const { rows } = await pool.query(
    `SELECT mr.*, u.name, u.corp, u.team, u.department FROM monthly_reports mr
     JOIN users u ON u.id = mr.user_id WHERE ${conditions.join(' AND ')} ORDER BY u.corp, u.team, u.name`,
    params
  );
  res.json({ yearMonth: targetYM, reports: rows });
});

// GET /api/admin/device-change-requests
router.get('/device-change-requests', async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT dcr.id, dcr.old_device_id, dcr.new_device_id, dcr.reason, dcr.status, dcr.requested_at, u.name, u.email
     FROM device_change_requests dcr JOIN users u ON u.id = dcr.user_id WHERE dcr.status=$1 ORDER BY dcr.requested_at DESC`,
    [status]
  );
  res.json({ requests: rows });
});

// POST /api/admin/device-change-requests/:id/approve
router.post('/device-change-requests/:id/approve', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    "SELECT * FROM device_change_requests WHERE id=$1 AND status='pending'", [req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: '요청을 찾을 수 없습니다.' }); return; }
  await pool.query(
    'UPDATE users SET device_id=$1, device_registered_at=now(), is_locked=FALSE, failed_login_attempts=0 WHERE id=$2',
    [rows[0].new_device_id, rows[0].user_id]
  );
  await pool.query(
    'UPDATE device_change_requests SET status=\'approved\', processed_at=now(), processed_by=$1 WHERE id=$2',
    [req.user.userId, req.params.id]
  );
  res.json({ success: true });
});

// POST /api/admin/device-change-requests/:id/reject
router.post('/device-change-requests/:id/reject', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    "UPDATE device_change_requests SET status='rejected', processed_at=now(), processed_by=$1 WHERE id=$2 AND status='pending' RETURNING id",
    [req.user.userId, req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: '요청을 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// POST /api/admin/users/:id/unlock
router.post('/users/:id/unlock', requireHR, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'UPDATE users SET is_locked=FALSE, locked_reason=NULL, failed_login_attempts=0 WHERE id=$1 RETURNING id, name',
    [req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: '사용자를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, user: rows[0] });
});

// POST /api/admin/attendance/:recordId/approve-time-change
router.post('/attendance/:recordId/approve-time-change', async (req: Request, res: Response): Promise<void> => {
  const { approve } = req.body;
  const { rows } = await pool.query(
    `UPDATE attendance_records SET temp_time_change_status=$1, temp_time_change_approved_by=$2
     WHERE id=$3 AND temp_time_change_status='pending' RETURNING id`,
    [approve ? 'approved' : 'rejected', req.user.userId, req.params.recordId]
  );
  if (rows.length === 0) { res.status(404).json({ error: '대기 중인 요청을 찾을 수 없습니다.' }); return; }
  res.json({ success: true });
});

// GET /api/admin/dashboard — 오늘 현황 요약 + 이번주 일별 통계
router.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  const { rows: todayRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE ar.check_in_time IS NOT NULL) AS checked_in,
       COUNT(*) FILTER (WHERE ar.check_out_time IS NOT NULL) AS checked_out,
       COUNT(*) FILTER (WHERE ar.status IN ('지각','지각조퇴')) AS late,
       COUNT(*) FILTER (WHERE ar.check_out_is_field = TRUE) AS field_checkout,
       COUNT(*) AS total
     FROM attendance_records ar JOIN users u ON ar.user_id = u.id
     WHERE ar.date = $1 AND u.role = 'worker' AND u.is_active = TRUE`,
    [today]
  );

  const { rows: weekRows } = await pool.query(
    `SELECT ar.date,
       COUNT(*) FILTER (WHERE ar.check_in_time IS NOT NULL) AS checked_in,
       COUNT(*) FILTER (WHERE ar.status IN ('지각','지각조퇴')) AS late,
       COUNT(*) FILTER (WHERE ar.status = '결근') AS absent,
       COUNT(*) FILTER (WHERE ar.check_out_is_field = TRUE) AS field_checkout
     FROM attendance_records ar JOIN users u ON ar.user_id = u.id
     WHERE ar.date >= date_trunc('week', CURRENT_DATE) AND ar.date <= CURRENT_DATE
       AND u.role = 'worker' AND u.is_active = TRUE
     GROUP BY ar.date ORDER BY ar.date`,
    []
  );

  const { rows: staffCount } = await pool.query(
    "SELECT COUNT(*) as count FROM users WHERE role = 'worker' AND is_active = TRUE"
  );

  res.json({
    today: todayRows[0],
    totalStaff: parseInt(staffCount[0].count, 10),
    weeklyChart: weekRows,
  });
});

// GET/POST /api/admin/company-settings — 지오펜스 설정
router.get('/company-settings', async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT * FROM company_settings ORDER BY id LIMIT 1');
  res.json({ settings: rows[0] || null });
});

router.post('/company-settings', async (req: Request, res: Response): Promise<void> => {
  const { lat, lng, radiusMeters, description } = req.body;
  if (!lat || !lng) { res.status(400).json({ error: 'lat, lng는 필수입니다.' }); return; }
  const { rows: existing } = await pool.query('SELECT id FROM company_settings ORDER BY id LIMIT 1');
  if (existing.length > 0) {
    await pool.query(
      'UPDATE company_settings SET lat=$1, lng=$2, radius_meters=$3, description=$4, updated_at=now() WHERE id=$5',
      [lat, lng, radiusMeters || 100, description || null, existing[0].id]
    );
  } else {
    await pool.query(
      'INSERT INTO company_settings (lat, lng, radius_meters, description) VALUES ($1,$2,$3,$4)',
      [lat, lng, radiusMeters || 100, description || null]
    );
  }
  res.json({ success: true });
});

export default router;

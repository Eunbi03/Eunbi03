import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { isWithinRadius, validateGpsReport, getGeofenceFromDB } from '../utils/geo';
import { requireAuth } from '../middleware/auth';

const router = Router();
const GPS_MAX_ACCURACY_M = parseFloat(process.env.GPS_MAX_ACCURACY_M || '50');

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 5);
}

async function resolveWorkplace(workplaceId?: string) {
  if (workplaceId) {
    const { rows } = await pool.query('SELECT * FROM workplaces WHERE id=$1', [workplaceId]);
    if (rows[0]) return { lat: rows[0].lat, lng: rows[0].lng, radiusM: rows[0].radius_m };
  }
  const geo = await getGeofenceFromDB(pool);
  if (geo) return geo;
  const lat = parseFloat(process.env.COMPANY_LAT || '0');
  const lng = parseFloat(process.env.COMPANY_LNG || '0');
  const radiusM = parseFloat(process.env.COMPANY_RADIUS_METERS || '100');
  if (!lat || !lng) return null;
  return { lat, lng, radiusM };
}

async function verifyLocation(
  res: Response,
  params: { lat: number; lng: number; accuracyM: number; isMocked: boolean; workplaceId?: string }
) {
  const gps = validateGpsReport({ ...params, maxAccuracyM: GPS_MAX_ACCURACY_M });
  if (!gps.isValid) {
    res.status(403).json({ error: '위치 정보 검증에 실패했습니다.', reasons: gps.reasons });
    return null;
  }
  const wp = await resolveWorkplace(params.workplaceId);
  if (!wp) {
    res.status(404).json({ error: '근무지 정보를 찾을 수 없습니다.' });
    return null;
  }
  const { withinRadius, distanceM } = isWithinRadius({ lat: params.lat, lng: params.lng, workplaceLat: wp.lat, workplaceLng: wp.lng, radiusM: wp.radiusM });
  return { withinRadius, distanceM, radiusM: wp.radiusM };
}

// POST /api/attendance/check-in
router.post('/check-in', requireAuth,
  [body('lat').isFloat(), body('lng').isFloat(), body('accuracyM').isFloat(), body('isMocked').isBoolean()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, accuracyM, isMocked, workplaceId } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    const existing = await pool.query('SELECT id FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]);
    if (existing.rows.length > 0) { res.status(409).json({ error: '오늘 이미 출근 처리되었습니다.' }); return; }

    const loc = await verifyLocation(res, { lat, lng, accuracyM, isMocked, workplaceId });
    if (!loc) return;
    if (!loc.withinRadius) {
      res.status(403).json({ error: `근무지 반경(${loc.radiusM}m) 밖입니다.`, distanceM: Math.round(loc.distanceM) }); return;
    }

    const { rows: userRows } = await pool.query('SELECT scheduled_start FROM users WHERE id=$1', [userId]);
    const status = nowHHMM() > userRows[0].scheduled_start.slice(0, 5) ? '지각' : '정상';

    const { rows } = await pool.query(
      `INSERT INTO attendance_records (user_id, date, check_in_time, check_in_lat, check_in_lng, check_in_location_verified, status)
       VALUES ($1,$2,now(),$3,$4,TRUE,$5) RETURNING id, check_in_time, status`,
      [userId, date, lat, lng, status]
    );
    res.status(201).json({ success: true, record: rows[0] });
  }
);

// POST /api/attendance/outing/start
router.post('/outing/start', requireAuth,
  [body('lat').isFloat(), body('lng').isFloat(), body('destination').notEmpty(), body('reason').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, destination, reason } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    const { rows: attRows } = await pool.query(
      'SELECT id, check_in_time, check_out_time FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]
    );
    if (attRows.length === 0 || !attRows[0].check_in_time) { res.status(409).json({ error: '출근 기록이 없습니다.' }); return; }
    if (attRows[0].check_out_time) { res.status(409).json({ error: '이미 퇴근 처리되었습니다.' }); return; }

    const { rows } = await pool.query(
      `INSERT INTO outing_records (attendance_record_id, user_id, start_time, start_lat, start_lng, destination, reason)
       VALUES ($1,$2,now(),$3,$4,$5,$6) RETURNING id, start_time`,
      [attRows[0].id, userId, lat, lng, destination, reason]
    );
    res.status(201).json({ success: true, outing: rows[0] });
  }
);

// POST /api/attendance/outing/:outingId/end
router.post('/outing/:outingId/end', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'UPDATE outing_records SET end_time=now() WHERE id=$1 AND user_id=$2 AND end_time IS NULL RETURNING id, end_time',
    [req.params.outingId, req.user.userId]
  );
  if (rows.length === 0) { res.status(404).json({ error: '진행 중인 외근 기록을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, outing: rows[0] });
});

// POST /api/attendance/check-out
router.post('/check-out', requireAuth,
  [
    body('lat').isFloat(), body('lng').isFloat(), body('accuracyM').isFloat(), body('isMocked').isBoolean(),
    body('isFieldCheckout').isBoolean(),
    body('dailyReport').notEmpty().withMessage('오늘 업무일지를 작성해주세요.'),
    body('tomorrowPlan').notEmpty().withMessage('내일 주요 업무를 작성해주세요.'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, accuracyM, isMocked, isFieldCheckout, workplaceId, dailyReport, tomorrowPlan } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    const { rows: attRows } = await pool.query(
      'SELECT * FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]
    );
    if (attRows.length === 0 || !attRows[0].check_in_time) { res.status(409).json({ error: '출근 기록이 없습니다.' }); return; }
    const record = attRows[0];
    if (record.check_out_time) { res.status(409).json({ error: '이미 퇴근 처리되었습니다.' }); return; }
    if (record.report_locked) { res.status(403).json({ error: '업무일지는 이미 제출되어 수정할 수 없습니다.' }); return; }

    if (!isFieldCheckout) {
      const loc = await verifyLocation(res, { lat, lng, accuracyM, isMocked, workplaceId });
      if (!loc) return;
      if (!loc.withinRadius) {
        res.status(403).json({ error: `근무지 반경(${loc.radiusM}m) 밖입니다.`, distanceM: Math.round(loc.distanceM) }); return;
      }
    } else {
      const gps = validateGpsReport({ lat, lng, accuracyM, isMocked, maxAccuracyM: GPS_MAX_ACCURACY_M });
      if (!gps.isValid) { res.status(403).json({ error: '위치 정보 검증에 실패했습니다.', reasons: gps.reasons }); return; }
    }

    const { rows: userRows } = await pool.query('SELECT scheduled_end FROM users WHERE id=$1', [userId]);
    const scheduledEnd = record.temp_time_change_status === 'approved' && record.temp_time_change_requested_end
      ? record.temp_time_change_requested_end.slice(0, 5)
      : userRows[0].scheduled_end.slice(0, 5);
    const isEarlyLeave = nowHHMM() < scheduledEnd;
    const newStatus = isEarlyLeave ? (record.status === '지각' ? '지각조퇴' : '조퇴') : record.status;

    const checkInTime = new Date(record.check_in_time);
    const checkOutTime = new Date();
    const workMinutes = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60000);

    const { rows } = await pool.query(
      `UPDATE attendance_records
       SET check_out_time=now(), check_out_lat=$1, check_out_lng=$2, check_out_is_field=$3,
           daily_report=$4, tomorrow_plan=$5, report_locked=TRUE, status=$6, work_minutes=$7
       WHERE id=$8 RETURNING id, check_out_time, status`,
      [lat, lng, isFieldCheckout, dailyReport, tomorrowPlan, newStatus, workMinutes, record.id]
    );
    res.json({ success: true, record: rows[0], message: '오늘 하루 수고하셨습니다.' });
  }
);

// GET /api/attendance/today
router.get('/today', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const date = todayKST();
  const { rows } = await pool.query(
    'SELECT * FROM attendance_records WHERE user_id=$1 AND date=$2', [req.user.userId, date]
  );
  res.json({ record: rows[0] || null });
});

// GET /api/attendance/history?page=1&limit=20
router.get('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));
  const offset = (page - 1) * limit;

  const { rows: countRows } = await pool.query(
    'SELECT COUNT(*) as count FROM attendance_records WHERE user_id=$1', [req.user.userId]
  );
  const total = parseInt(countRows[0].count, 10);

  const { rows } = await pool.query(
    `SELECT date, check_in_time, check_out_time, status, work_minutes
     FROM attendance_records WHERE user_id=$1 ORDER BY date DESC LIMIT $2 OFFSET $3`,
    [req.user.userId, limit, offset]
  );
  res.json({ records: rows, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
});

// GET /api/attendance/weekly-summary
router.get('/weekly-summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT date, check_in_time, check_out_time, work_minutes
     FROM attendance_records WHERE user_id=$1 AND date >= date_trunc('week', CURRENT_DATE) AND date <= CURRENT_DATE ORDER BY date`,
    [req.user.userId]
  );
  let totalMinutes = 0;
  const days = rows.map((r: any) => {
    const minutes = r.work_minutes ? Math.round(Number(r.work_minutes)) : 0;
    totalMinutes += minutes;
    return { date: r.date, minutesWorked: minutes };
  });
  res.json({ totalHours: Math.floor(totalMinutes / 60), totalMinutes: totalMinutes % 60, days });
});

// POST /api/attendance/time-change-request
router.post('/time-change-request', requireAuth,
  [body('requestedEnd').matches(/^\d{2}:\d{2}$/), body('reason').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const { requestedEnd, reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE attendance_records
       SET temp_time_change_requested_end=$1, temp_time_change_reason=$2,
           temp_time_change_status='pending', temp_time_change_at=now()
       WHERE user_id=$3 AND date=$4 RETURNING id`,
      [requestedEnd, reason, req.user.userId, todayKST()]
    );
    if (rows.length === 0) { res.status(404).json({ error: '오늘 출근 기록이 없습니다.' }); return; }
    res.status(201).json({ success: true });
  }
);

export default router;

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { isWithinRadius, validateGpsReport, getGeofenceFromDB } from '../utils/geo';
import { requireAuth } from '../middleware/auth';

const router = Router();
const GPS_MAX_ACCURACY_M = parseFloat(process.env.GPS_MAX_ACCURACY_M || '200');

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 5);
}

// 사용자 근무지 정보 조회 + 거리 계산 (블록하지 않음, 기록만)
async function calcDistance(userId: string, lat: number, lng: number): Promise<{ distanceM: number | null; wpName: string | null }> {
  const { rows } = await pool.query(
    `SELECT w.lat, w.lng, w.radius_m, w.name FROM users u
     LEFT JOIN workplaces w ON u.workplace_id=w.id WHERE u.id=$1`, [userId]
  );
  if (!rows[0] || rows[0].lat == null) return { distanceM: null, wpName: null };
  const { distanceM } = isWithinRadius({ lat, lng, workplaceLat: rows[0].lat, workplaceLng: rows[0].lng, radiusM: rows[0].radius_m || 200 });
  return { distanceM: Math.round(distanceM * 10) / 10, wpName: rows[0].name };
}

// POST /api/attendance/check-in
router.post('/check-in', requireAuth,
  [body('lat').isFloat(), body('lng').isFloat(), body('accuracyM').isFloat({ min: 0 }), body('isMocked').isBoolean()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, accuracyM, isMocked } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    // GPS 유효성 (정확도 기준만 체크, 위치는 어디서든 허용)
    const gps = validateGpsReport({ lat, lng, accuracyM, isMocked, maxAccuracyM: GPS_MAX_ACCURACY_M });
    if (!gps.isValid) { res.status(403).json({ error: '위치 정보 검증에 실패했습니다.', reasons: gps.reasons }); return; }

    const existing = await pool.query('SELECT id FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]);
    if (existing.rows.length > 0) { res.status(409).json({ error: '오늘 이미 출근 처리되었습니다.' }); return; }

    const { distanceM } = await calcDistance(userId, lat, lng);
    const { rows: userRows } = await pool.query('SELECT scheduled_start FROM users WHERE id=$1', [userId]);
    const scheduledStart = userRows[0]?.scheduled_start?.slice(0, 5) || '09:00';
    const status = nowHHMM() > scheduledStart ? '지각' : '정상';

    const { rows } = await pool.query(
      `INSERT INTO attendance_records (user_id, date, check_in_time, check_in_lat, check_in_lng,
         check_in_location_verified, check_in_distance_m, status)
       VALUES ($1,$2,now(),$3,$4,TRUE,$5,$6) RETURNING id, check_in_time, status`,
      [userId, date, lat, lng, distanceM, status]
    );
    res.status(201).json({ success: true, record: rows[0], distanceM });
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
    if (!attRows[0]?.check_in_time) { res.status(409).json({ error: '출근 기록이 없습니다.' }); return; }
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
  if (!rows[0]) { res.status(404).json({ error: '진행 중인 외근 기록을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, outing: rows[0] });
});

// POST /api/attendance/check-out
router.post('/check-out', requireAuth,
  [
    body('lat').isFloat(), body('lng').isFloat(), body('accuracyM').isFloat({ min: 0 }), body('isMocked').isBoolean(),
    body('workNoteIn').notEmpty().withMessage('출근 장소를 입력해주세요.'),
    body('workNoteOut').notEmpty().withMessage('퇴근 장소를 입력해주세요.'),
    body('workNoteToday').notEmpty().withMessage('오늘 한 업무를 입력해주세요.'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, accuracyM, isMocked, workNoteIn, workNoteOut, workNoteField, workNoteToday } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    const gps = validateGpsReport({ lat, lng, accuracyM, isMocked, maxAccuracyM: GPS_MAX_ACCURACY_M });
    if (!gps.isValid) { res.status(403).json({ error: '위치 정보 검증에 실패했습니다.', reasons: gps.reasons }); return; }

    const { rows: attRows } = await pool.query('SELECT * FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]);
    if (!attRows[0]?.check_in_time) { res.status(409).json({ error: '출근 기록이 없습니다.' }); return; }
    const record = attRows[0];
    if (record.check_out_time) { res.status(409).json({ error: '이미 퇴근 처리되었습니다.' }); return; }

    const { distanceM } = await calcDistance(userId, lat, lng);

    const { rows: userRows } = await pool.query('SELECT scheduled_end FROM users WHERE id=$1', [userId]);
    const scheduledEnd = record.temp_time_change_status === 'approved' && record.temp_time_change_requested_end
      ? record.temp_time_change_requested_end.slice(0, 5)
      : userRows[0]?.scheduled_end?.slice(0, 5) || '18:00';
    const isEarlyLeave = nowHHMM() < scheduledEnd;
    const newStatus = isEarlyLeave ? (record.status === '지각' ? '지각조퇴' : '조퇴') : record.status;

    const workMinutes = Math.round((Date.now() - new Date(record.check_in_time).getTime()) / 60000);

    const { rows } = await pool.query(
      `UPDATE attendance_records
       SET check_out_time=now(), check_out_lat=$1, check_out_lng=$2, check_out_is_field=FALSE,
           check_out_distance_m=$3,
           work_note_in=$4, work_note_out=$5, work_note_field=$6, work_note_today=$7,
           daily_report=$7, report_locked=TRUE, status=$8, work_minutes=$9
       WHERE id=$10 RETURNING id, check_out_time, status`,
      [lat, lng, distanceM, workNoteIn, workNoteOut, workNoteField || null, workNoteToday, newStatus, workMinutes, record.id]
    );
    res.json({ success: true, record: rows[0], message: '오늘 하루 수고하셨습니다.' });
  }
);

// GET /api/attendance/today
router.get('/today', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const date = todayKST();
  const { rows } = await pool.query(`
    SELECT ar.*, o.id AS outing_id, o.start_time AS outing_start, o.end_time AS outing_end,
           o.destination, o.reason
    FROM attendance_records ar
    LEFT JOIN outing_records o ON o.attendance_record_id=ar.id AND o.end_time IS NULL
    WHERE ar.user_id=$1 AND ar.date=$2`, [req.user.userId, date]
  );
  res.json({ record: rows[0] || null });
});

// GET /api/attendance/weekly-summary
router.get('/weekly-summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT date, check_in_time, check_out_time, work_minutes, status
     FROM attendance_records WHERE user_id=$1 AND date>=date_trunc('week',CURRENT_DATE) AND date<=CURRENT_DATE ORDER BY date`,
    [req.user.userId]
  );
  let totalMinutes = 0;
  let lateCount = 0;
  const days = rows.map((r: any) => {
    const m = r.work_minutes ? Math.round(Number(r.work_minutes)) : 0;
    totalMinutes += m;
    if (r.status === '지각' || r.status === '지각조퇴') lateCount++;
    return { date: r.date, minutesWorked: m, status: r.status };
  });
  res.json({ totalHours: Math.floor(totalMinutes / 60), totalMinutes: totalMinutes % 60, lateCount, days });
});

// POST /api/attendance/time-change-request
router.post('/time-change-request', requireAuth,
  [body('requestedEnd').matches(/^\d{2}:\d{2}$/), body('reason').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const { requestedEnd, reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE attendance_records SET temp_time_change_requested_end=$1, temp_time_change_reason=$2,
         temp_time_change_status='pending', temp_time_change_at=now()
       WHERE user_id=$3 AND date=$4 RETURNING id`,
      [requestedEnd, reason, req.user.userId, todayKST()]
    );
    if (!rows[0]) { res.status(404).json({ error: '오늘 출근 기록이 없습니다.' }); return; }
    res.status(201).json({ success: true });
  }
);

export default router;

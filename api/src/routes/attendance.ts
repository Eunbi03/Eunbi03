import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { isWithinRadius, validateGpsReport, haversineDistanceMeters } from '../utils/geo';
import { requireAuth } from '../middleware/auth';
import { workdaysBetween, isHoliday } from '../utils/holidays';
import { classifyDay } from '../utils/attendanceKpi';

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

// POST /api/attendance/fcm-token — 근로자 기기의 푸시 토큰 등록/갱신
router.post('/fcm-token', requireAuth,
  [body('token').isString().notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    await pool.query('UPDATE users SET fcm_token=$1 WHERE id=$2', [req.body.token, req.user.userId]);
    res.json({ success: true });
  }
);

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

// GET /api/attendance/workplaces — 외근 목적지 자동완성용 근무지 목록 (근로자 접근 가능)
router.get('/workplaces', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query('SELECT id, name FROM workplaces WHERE is_active=TRUE ORDER BY name');
  res.json({ workplaces: rows });
});

// POST /api/attendance/outing/start
router.post('/outing/start', requireAuth,
  [body('lat').isFloat(), body('lng').isFloat(), body('destination').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, destination, reason, workplaceId } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    const { rows: attRows } = await pool.query(
      'SELECT id, check_in_time, check_out_time FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]
    );
    if (!attRows[0]?.check_in_time) { res.status(409).json({ error: '출근 기록이 없습니다.' }); return; }
    if (attRows[0].check_out_time) { res.status(409).json({ error: '이미 퇴근 처리되었습니다.' }); return; }

    // 등록된 근무지를 목적지로 선택한 경우 거리 계산 (직접 입력이면 거리 없음)
    let wpId: string | null = null;
    let distanceM: number | null = null;
    if (workplaceId) {
      const { rows: wp } = await pool.query('SELECT id, lat, lng FROM workplaces WHERE id=$1 AND is_active=TRUE', [workplaceId]);
      if (wp[0]) { wpId = wp[0].id; distanceM = haversineDistanceMeters(lat, lng, wp[0].lat, wp[0].lng); }
    }

    // 이동 중이던(종료되지 않은) 외근은 자동 종료 후 새 외근 시작 (장소를 옮겨다니며 연속 외근 가능)
    await pool.query('UPDATE outing_records SET end_time=now() WHERE attendance_record_id=$1 AND end_time IS NULL', [attRows[0].id]);

    const { rows } = await pool.query(
      `INSERT INTO outing_records (attendance_record_id, user_id, start_time, start_lat, start_lng, destination, reason, workplace_id, distance_m)
       VALUES ($1,$2,now(),$3,$4,$5,$6,$7,$8) RETURNING id, start_time`,
      [attRows[0].id, userId, lat, lng, destination, reason || null, wpId, distanceM]
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

    // 진행 중인 외출 기록 자동 종료
    await pool.query('UPDATE outing_records SET end_time=now() WHERE attendance_record_id=$1 AND end_time IS NULL', [record.id]);

    const { rows } = await pool.query(
      `UPDATE attendance_records
       SET check_out_time=now(), check_out_lat=$1, check_out_lng=$2, check_out_is_field=FALSE,
           check_out_distance_m=$3,
           work_note_in=COALESCE(NULLIF($4,''), work_note_in),
           work_note_out=COALESCE(NULLIF($5,''), work_note_out),
           work_note_field=COALESCE(NULLIF($6,''), work_note_field),
           work_note_today=COALESCE(NULLIF($7,''), work_note_today),
           daily_report=COALESCE(NULLIF($7,''), daily_report),
           status=$8, work_minutes=$9
       WHERE id=$10 RETURNING id, check_out_time, status`,
      [lat, lng, distanceM, workNoteIn || '', workNoteOut || '', workNoteField || '', workNoteToday || '', newStatus, workMinutes, record.id]
    );
    res.json({ success: true, record: rows[0], message: '오늘 하루 수고하셨습니다.' });
  }
);

// PUT /api/attendance/work-note — 당일 근무노트 상시 작성/수정 (출근 후 언제든, 퇴근 후에도 당일 내 수정 가능)
router.put('/work-note', requireAuth,
  [
    body('workNoteToday').notEmpty().withMessage('오늘 한 업무를 입력해주세요.'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { workNoteToday, workNoteField } = req.body;
    const userId = req.user.userId;
    const date = todayKST();

    const { rows: attRows } = await pool.query('SELECT id, check_in_time FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]);
    if (!attRows[0]?.check_in_time) { res.status(409).json({ error: '출근 기록이 없습니다.' }); return; }

    const { rows } = await pool.query(
      `UPDATE attendance_records
       SET work_note_today=$1, daily_report=$1,
           work_note_field=COALESCE(NULLIF($2,''), work_note_field)
       WHERE id=$3 RETURNING work_note_today, work_note_field`,
      [workNoteToday, workNoteField || '', attRows[0].id]
    );
    res.json({ success: true, noteToday: rows[0].work_note_today, noteField: rows[0].work_note_field });
  }
);

// GET /api/attendance/today
router.get('/today', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const date = todayKST();
  const [{ rows: attRows }, { rows: userRows }] = await Promise.all([
    pool.query(`SELECT * FROM attendance_records WHERE user_id=$1 AND date=$2`, [req.user.userId, date]),
    pool.query(`SELECT u.scheduled_start, u.scheduled_end, w.name AS workplace_name
                FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id WHERE u.id=$1`, [req.user.userId]),
  ]);

  const schedule = {
    start: userRows[0]?.scheduled_start?.slice(0, 5) || '09:00',
    end: userRows[0]?.scheduled_end?.slice(0, 5) || '18:00',
    workplaceName: userRows[0]?.workplace_name || null,
  };

  const att = attRows[0];
  if (!att) { res.json({ record: null, schedule }); return; }

  const { rows: outingRows } = await pool.query(
    `SELECT id, start_time, end_time, destination, reason, start_lat, start_lng
     FROM outing_records WHERE attendance_record_id=$1 ORDER BY start_time`,
    [att.id]
  );

  const record = {
    id: att.id,
    date: att.date,
    checkIn: att.check_in_time ? {
      time: att.check_in_time,
      lat: att.check_in_lat, lng: att.check_in_lng,
      distanceM: att.check_in_distance_m,
    } : null,
    checkOut: att.check_out_time ? {
      time: att.check_out_time,
      lat: att.check_out_lat, lng: att.check_out_lng,
      distanceM: att.check_out_distance_m,
    } : null,
    outings: outingRows.map((o: any) => ({
      id: o.id,
      startTime: o.start_time,
      endTime: o.end_time,
      destination: o.destination,
      reason: o.reason,
      startLocation: o.start_lat ? { lat: o.start_lat, lng: o.start_lng } : null,
    })),
    workMinutes: att.work_minutes ? Math.round(Number(att.work_minutes)) : null,
    status: att.status,
    leaveType: att.leave_type,
    timeChangeStatus: att.temp_time_change_status,
    noteIn: att.work_note_in,
    noteOut: att.work_note_out,
    noteField: att.work_note_field,
    noteToday: att.work_note_today,
  };
  res.json({ record, schedule });
});

// GET /api/attendance/weekly-summary
router.get('/weekly-summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const today = todayKST();
  const { rows: uRows } = await pool.query('SELECT note_exempt FROM users WHERE id=$1', [req.user.userId]);
  const noteExempt = !!uRows[0]?.note_exempt;
  const { rows } = await pool.query(
    `SELECT date::text AS date, check_in_time, check_out_time, work_minutes, status, leave_type, work_note_today, daily_report
     FROM attendance_records WHERE user_id=$1 AND date>=date_trunc('week',CURRENT_DATE AT TIME ZONE 'Asia/Seoul') AND date<=CURRENT_DATE ORDER BY date`,
    [req.user.userId]
  );

  const recByDate: Record<string, any> = {};
  for (const r of rows) recByDate[r.date] = r;

  // 이번 주 일~토 (KST) 7일
  const [y, mo, dy] = today.split('-').map(Number);
  const todayDow = new Date(Date.UTC(y, mo - 1, dy, 12)).getUTCDay(); // 0=일
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(Date.UTC(y, mo - 1, dy - todayDow + i, 12));
    weekDates.push(d2.toISOString().slice(0, 10));
  }

  let totalWorkMinutes = 0, lateDays = 0, earlyLeaveDays = 0, leaveDays = 0;
  let workedDays = 0, missingIn = 0, missingOut = 0, missingNote = 0;

  const days = weekDates.map((date) => {
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const isFuture = date > today;
    const isToday = date === today;
    const isWorkday = !isWeekend && !isHoliday(date);
    const r = recByDate[date];
    const k = classifyDay(r, noteExempt);

    const base: any = { date, dow, isToday, isFuture, isWorkday, off: !isWorkday, leaveType: r?.leave_type ?? null };

    if (k.isLeave) { leaveDays++; return { ...base, leave: true }; }

    if (!k.present) {
      // 근무일인데 미출근 → 출근누락 (미래/비근무일은 집계 제외). 노트 없으면 노트누락도 집계.
      if (isWorkday && !isFuture) { missingIn++; if (k.missingNote) missingNote++; }
      return { ...base, present: false, missing: isWorkday && !isFuture, noteMiss: isWorkday && !isFuture && k.missingNote };
    }

    const m = r.work_minutes ? Math.round(Number(r.work_minutes)) : 0;
    workedDays++;
    totalWorkMinutes += m;
    if (k.isLate) lateDays++;
    if (k.isEarlyLeave) earlyLeaveDays++;
    if (k.missingOut) missingOut++;
    if (k.missingNote) missingNote++;
    return {
      ...base, present: true, minutesWorked: m,
      checkInTime: r.check_in_time, checkOutTime: r.check_out_time,
      late: k.isLate, noOut: k.missingOut, noteMiss: k.missingNote,
    };
  });

  res.json({ workedDays, leaveDays, lateDays, earlyLeaveDays, missingIn, missingOut, missingNote, totalWorkMinutes, days });
});

// GET /api/attendance/monthly-summary
router.get('/monthly-summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const today = todayKST();
  const { rows: muRows } = await pool.query('SELECT note_exempt FROM users WHERE id=$1', [req.user.userId]);
  const noteExempt = !!muRows[0]?.note_exempt;
  const monthStart = today.slice(0, 7) + '-01';
  const { rows } = await pool.query(
    `SELECT date::text AS date, work_minutes, status, leave_type, check_in_time, work_note_today, daily_report FROM attendance_records
     WHERE user_id=$1 AND date>=$2 AND date<=$3`,
    [req.user.userId, monthStart, today]
  );
  const recByDate: Record<string, any> = {};
  for (const r of rows) recByDate[r.date] = r;

  const workdays = workdaysBetween(monthStart, today);
  let totalWorkMinutes = 0, lateDays = 0, earlyLeaveDays = 0, leaveDays = 0;
  let workedDays = 0, missingIn = 0, missingOut = 0, missingNote = 0;

  for (const day of workdays) {
    const r = recByDate[day];
    const k = classifyDay(r, noteExempt);
    if (k.isLeave) { leaveDays++; continue; }
    if (!k.present) { missingIn++; if (k.missingNote) missingNote++; continue; }
    workedDays++;
    totalWorkMinutes += r.work_minutes ? Math.round(Number(r.work_minutes)) : 0;
    if (k.isLate) lateDays++;
    if (k.isEarlyLeave) earlyLeaveDays++;
    if (k.missingOut) missingOut++;
    if (k.missingNote) missingNote++;
  }
  res.json({ workedDays, leaveDays, lateDays, earlyLeaveDays, missingIn, missingOut, missingNote, totalWorkMinutes });
});

// GET /api/attendance/history
router.get('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user.userId;
  const toDate = (req.query.to as string) || todayKST();
  const d = new Date(toDate + 'T00:00:00+09:00');
  d.setDate(d.getDate() - 89);
  const fromDate = (req.query.from as string) || d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  const { rows } = await pool.query(
    `SELECT date::text AS date, check_in_time, check_out_time, work_minutes, status,
            leave_type, work_note_in, work_note_out, work_note_field, work_note_today,
            check_in_distance_m, check_out_distance_m
     FROM attendance_records WHERE user_id=$1 AND date>=$2 AND date<=$3
     ORDER BY date DESC`,
    [userId, fromDate, toDate]
  );

  const recByDate: Record<string, any> = {};
  for (const r of rows) recByDate[r.date] = r;

  // Include all workdays (even without records) + weekend days that have records
  const wdays = workdaysBetween(fromDate, toDate);
  const wdaySet = new Set(wdays);
  const weekendWithRec = Object.keys(recByDate).filter(date => !wdaySet.has(date)).sort();
  const allDays = [...wdays, ...weekendWithRec].sort().reverse(); // newest first

  const records = allDays.map((date) => {
    const r = recByDate[date];
    if (!r) return { date, checkIn: null, checkOut: null, workMinutes: null, status: null, leaveType: null, noteIn: null, noteOut: null, noteField: null, noteToday: null };
    return {
      date: r.date,
      checkIn: r.check_in_time ? { time: r.check_in_time, distanceM: r.check_in_distance_m } : null,
      checkOut: r.check_out_time ? { time: r.check_out_time, distanceM: r.check_out_distance_m } : null,
      workMinutes: r.work_minutes ? Math.round(Number(r.work_minutes)) : null,
      status: r.status,
      leaveType: r.leave_type,
      noteIn: r.work_note_in,
      noteOut: r.work_note_out,
      noteField: r.work_note_field,
      noteToday: r.work_note_today,
    };
  });
  res.json({ records });
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

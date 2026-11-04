import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { validateGpsReport, haversineDistanceMeters } from '../utils/geo';
import { nearestWorkplace } from '../utils/workplaces';
import { requireAuth } from '../middleware/auth';
import { workdaysBetween, isHoliday } from '../utils/holidays';
import { classifyDay } from '../utils/attendanceKpi';
import { generateRandomCheckSlotsForUser } from '../jobs/scheduler';

const router = Router();
const GPS_MAX_ACCURACY_M = parseFloat(process.env.GPS_MAX_ACCURACY_M || '500');

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function nowHHMM(): string {
  const s = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 5);
  return s === '24:00' ? '00:00' : s; // 일부 환경에서 자정이 24:00으로 나오는 경우 방어
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

    // 실제 출근(check_in_time)이 있을 때만 막는다.
    // 출근 인정 등으로 생성된 빈 행(check_in_time 없음)이면 그 행을 업데이트해 출근 처리한다.
    const existing = await pool.query(
      'SELECT id, check_in_time FROM attendance_records WHERE user_id=$1 AND date=$2', [userId, date]
    );
    if (existing.rows[0]?.check_in_time) { res.status(409).json({ error: '오늘 이미 출근 처리되었습니다.' }); return; }

    const { rows: userRows } = await pool.query('SELECT scheduled_start FROM users WHERE id=$1', [userId]);
    const scheduledStart = userRows[0]?.scheduled_start?.slice(0, 5) || '09:00';
    const status = nowHHMM() > scheduledStart ? '지각' : '정상';

    // 출근은 '빠르게': 위치만 저장하고 즉시 완료 응답. 거리·근무지 판정은 응답 후 비동기로 계산해
    // 관리자 화면에 반영한다. (거리 계산 전에는 distance/verified/place = NULL → '계산 중')
    let rows;
    if (existing.rows[0]) {
      // 기존 빈 행(출근 인정 등) → 실제 출근으로 업데이트
      ({ rows } = await pool.query(
        `UPDATE attendance_records
         SET check_in_time=now(), check_in_lat=$1, check_in_lng=$2,
             check_in_location_verified=NULL, check_in_distance_m=NULL, check_in_place=NULL, status=$3
         WHERE id=$4 RETURNING id, check_in_time, status`,
        [lat, lng, status, existing.rows[0].id]
      ));
    } else {
      ({ rows } = await pool.query(
        `INSERT INTO attendance_records (user_id, date, check_in_time, check_in_lat, check_in_lng,
           check_in_location_verified, check_in_distance_m, status)
         VALUES ($1,$2,now(),$3,$4,NULL,NULL,$5) RETURNING id, check_in_time, status`,
        [userId, date, lat, lng, status]
      ));
    }
    const recordId = rows[0].id;

    // 즉시 완료 응답 (근로자 대기 없음)
    res.status(201).json({ success: true, record: rows[0] });

    // ── 응답 후 처리(비동기): 거리·근무지 판정 + 랜덤슬롯 생성 ──
    (async () => {
      try {
        const n = await nearestWorkplace(lat, lng);
        await pool.query(
          `UPDATE attendance_records SET check_in_distance_m=$1, check_in_location_verified=$2, check_in_place=$3 WHERE id=$4`,
          [n.distanceM, n.withinAny, n.wpName, recordId]
        );
      } catch (e: any) { console.error('[출근 거리계산 실패]', e.message); }
      try {
        const { rows: slotRows } = await pool.query(
          'SELECT 1 FROM random_location_checks WHERE user_id=$1 AND date=$2 LIMIT 1', [userId, date]
        );
        if (slotRows.length === 0) {
          const { rows: u } = await pool.query(
            'SELECT id, scheduled_start, scheduled_end, lunch_start, lunch_end FROM users WHERE id=$1', [userId]
          );
          if (u[0]) await generateRandomCheckSlotsForUser(u[0], date, true, true); // onlyFuture + force
        }
      } catch (e: any) { console.error('[출근 시 랜덤슬롯 생성 실패]', e.message); }
    })();
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

// POST /api/attendance/outing/:outingId/end — 복귀(외근 종료)
// 기본 근무지 개념 제거 후: 위치가 함께 오면 '그날 출근했던 근무지' 기준으로 거리를 계산해
// 복귀 기록을 남긴다. (출근 근무지 = 출근 당시 가장 가까웠던 근무지)
router.post('/outing/:outingId/end', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user.userId;
  const { lat, lng } = req.body || {};
  const { rows } = await pool.query(
    'UPDATE outing_records SET end_time=now() WHERE id=$1 AND user_id=$2 AND end_time IS NULL RETURNING id, end_time, attendance_record_id',
    [req.params.outingId, userId]
  );
  if (!rows[0]) { res.status(404).json({ error: '진행 중인 외근 기록을 찾을 수 없습니다.' }); return; }

  // 위치가 오면 '출근했던 근무지'로 복귀 거리계산 후 복귀 기록 생성
  if (typeof lat === 'number' && typeof lng === 'number') {
    try {
      const arId = rows[0].attendance_record_id;
      const { rows: ar } = await pool.query('SELECT check_in_lat, check_in_lng FROM attendance_records WHERE id=$1', [arId]);
      if (ar[0]?.check_in_lat != null) {
        const ci = await nearestWorkplace(ar[0].check_in_lat, ar[0].check_in_lng); // 출근 당시 근무지
        if (ci.wpId && ci.wpLat != null && ci.wpLng != null) {
          const d = Math.round(haversineDistanceMeters(lat, lng, ci.wpLat, ci.wpLng) * 10) / 10;
          await pool.query(
            `INSERT INTO outing_records (attendance_record_id, user_id, start_time, end_time, start_lat, start_lng, destination, workplace_id, distance_m)
             VALUES ($1,$2,now(),now(),$3,$4,$5,$6,$7)`,
            [arId, userId, lat, lng, `${ci.wpName} 복귀`, ci.wpId, d]
          );
        }
      }
    } catch (e: any) { console.error('[복귀 거리계산 실패]', e.message); }
  }
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

    const nOut = await nearestWorkplace(lat, lng);

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
           check_out_distance_m=$3, check_out_location_verified=$11, check_out_place=$12,
           work_note_in=COALESCE(NULLIF($4,''), work_note_in),
           work_note_out=COALESCE(NULLIF($5,''), work_note_out),
           work_note_field=COALESCE(NULLIF($6,''), work_note_field),
           work_note_today=COALESCE(NULLIF($7,''), work_note_today),
           daily_report=COALESCE(NULLIF($7,''), daily_report),
           status=$8, work_minutes=$9
       WHERE id=$10 RETURNING id, check_out_time, status`,
      [lat, lng, nOut.distanceM, workNoteIn || '', workNoteOut || '', workNoteField || '', workNoteToday || '', newStatus, workMinutes, record.id, nOut.withinAny, nOut.wpName]
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
    pool.query(`SELECT u.scheduled_start, u.scheduled_end, u.irregular_worker, w.name AS workplace_name, w.radius_m
                FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id WHERE u.id=$1`, [req.user.userId]),
  ]);

  const schedule = {
    start: userRows[0]?.scheduled_start?.slice(0, 5) || '09:00',
    end: userRows[0]?.scheduled_end?.slice(0, 5) || '18:00',
    workplaceName: userRows[0]?.workplace_name || null,
    radiusM: userRows[0]?.radius_m ?? 500,
  };

  // 알림용: 비정기 근무자 여부 + 오늘이 근무일(주말·공휴일 제외)인지
  const irregularWorker = !!userRows[0]?.irregular_worker;
  const [yy, mm, dd] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(yy, mm - 1, dd, 12)).getUTCDay();
  const isWorkday = dow !== 0 && dow !== 6 && !isHoliday(date);

  const att = attRows[0];
  if (!att) { res.json({ record: null, schedule, irregularWorker, isWorkday }); return; }

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
      within: att.check_in_location_verified,
    } : null,
    checkOut: att.check_out_time ? {
      time: att.check_out_time,
      lat: att.check_out_lat, lng: att.check_out_lng,
      distanceM: att.check_out_distance_m,
      within: att.check_out_location_verified,
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
  res.json({ record, schedule, irregularWorker, isWorkday });
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

// ── 연장 근무 신청 (근로자) ─────────────────────────────────────────
// 규칙: 신청·삭제 = 연장일 '당일 이전'만, 수정 = 연장일 +2일까지(수정 시 재승인 → pending)
const OT_TIME = /^\d{2}:\d{2}$/;
function daysBetweenKST(dateStr: string): number {
  // (work_date - today) in days, KST 자정 기준
  const today = todayKST();
  const a = new Date(today + 'T00:00:00Z').getTime();
  const b = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

// GET /api/attendance/overtime — 내 연장근무 신청 목록(예정·최근)
router.get('/overtime', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, work_date::text AS work_date, to_char(start_time,'HH24:MI') AS start_time,
            to_char(end_time,'HH24:MI') AS end_time, place, workplace_id, purpose, status, reject_reason
       FROM overtime_requests WHERE user_id=$1
      ORDER BY work_date DESC, start_time`,
    [req.user.userId]
  );
  res.json({ overtime: rows });
});

// POST /api/attendance/overtime — 신청 (연장일 당일 이전만)
router.post('/overtime', requireAuth,
  [body('workDate').matches(/^\d{4}-\d{2}-\d{2}$/), body('startTime').matches(OT_TIME),
   body('endTime').matches(OT_TIME), body('place').notEmpty(), body('purpose').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const { workDate, startTime, endTime, place, purpose, workplaceId } = req.body;
    const d0 = daysBetweenKST(workDate);
    if (d0 < 0) { res.status(400).json({ error: '지난 날짜에는 신청할 수 없습니다.' }); return; }
    if (d0 === 0) {
      // 당일: 본래 근무 종료시간(정규 퇴근) 전까지만 신청 가능
      const { rows: u } = await pool.query('SELECT scheduled_end FROM users WHERE id=$1', [req.user.userId]);
      const se = (u[0]?.scheduled_end ? String(u[0].scheduled_end).slice(0, 5) : '18:00');
      if (nowHHMM() >= se) { res.status(400).json({ error: '연장 근무 신청은 본래 근무시간 이내(정규 퇴근 전)에만 가능합니다.' }); return; }
    }
    if (endTime <= startTime) { res.status(400).json({ error: '종료 시간이 시작 시간보다 늦어야 합니다.' }); return; }
    try {
      const { rows } = await pool.query(
        `INSERT INTO overtime_requests (user_id, work_date, start_time, end_time, place, workplace_id, purpose)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [req.user.userId, workDate, startTime, endTime, String(place).trim(), workplaceId || null, String(purpose).trim()]
      );
      res.status(201).json({ success: true, id: rows[0].id });
    } catch (e: any) {
      if (e.code === '23505') { res.status(409).json({ error: '해당 날짜에 이미 연장 근무 신청이 있습니다.' }); return; }
      throw e;
    }
  }
);

// PUT /api/attendance/overtime/:id — 수정 (연장일 +2일까지, 수정 시 재승인)
router.put('/overtime/:id', requireAuth,
  [body('startTime').matches(OT_TIME), body('endTime').matches(OT_TIME), body('place').notEmpty(), body('purpose').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const { startTime, endTime, place, purpose, workplaceId } = req.body;
    if (endTime <= startTime) { res.status(400).json({ error: '종료 시간이 시작 시간보다 늦어야 합니다.' }); return; }
    const { rows: cur } = await pool.query('SELECT work_date::text AS work_date FROM overtime_requests WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    if (!cur[0]) { res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' }); return; }
    if (daysBetweenKST(cur[0].work_date) < -2) { res.status(400).json({ error: '수정은 연장일 +2일까지만 가능합니다.' }); return; }
    await pool.query(
      `UPDATE overtime_requests
         SET start_time=$1, end_time=$2, place=$3, workplace_id=$4, purpose=$5,
             status='pending', reject_reason=NULL, decided_by=NULL, decided_by_name=NULL, decided_at=NULL, updated_at=now()
       WHERE id=$6 AND user_id=$7`,
      [startTime, endTime, String(place).trim(), workplaceId || null, String(purpose).trim(), req.params.id, req.user.userId]
    );
    res.json({ success: true });
  }
);

// DELETE /api/attendance/overtime/:id — 삭제 (연장일 당일 이전만)
router.delete('/overtime/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows: cur } = await pool.query('SELECT work_date::text AS work_date FROM overtime_requests WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
  if (!cur[0]) { res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' }); return; }
  const dd = daysBetweenKST(cur[0].work_date);
  if (dd < 0) { res.status(400).json({ error: '연장 근무일이 지나 삭제할 수 없습니다.' }); return; }
  if (dd === 0) {
    const { rows: u } = await pool.query('SELECT scheduled_end FROM users WHERE id=$1', [req.user.userId]);
    const se = (u[0]?.scheduled_end ? String(u[0].scheduled_end).slice(0, 5) : '18:00');
    if (nowHHMM() >= se) { res.status(400).json({ error: '삭제는 본래 근무시간 이내(정규 퇴근 전)에만 가능합니다.' }); return; }
  }
  await pool.query('DELETE FROM overtime_requests WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
  res.json({ success: true });
});

export default router;

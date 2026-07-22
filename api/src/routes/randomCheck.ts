import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { isWithinRadius, validateGpsReport } from '../utils/geo';
import { requireAuth } from '../middleware/auth';

const router = Router();
const GPS_MAX_ACCURACY_M = parseFloat(process.env.GPS_MAX_ACCURACY_M || '500');

// 특정 체크 슬롯에 위치를 기록하는 공통 로직
async function recordCheckLocation(
  checkId: string, userId: string,
  lat: number, lng: number, accuracyM: number, isMocked: boolean
): Promise<{ status: number; body: any }> {
  const { rows: checkRows } = await pool.query(
    'SELECT * FROM random_location_checks WHERE id=$1 AND user_id=$2', [checkId, userId]
  );
  if (checkRows.length === 0) return { status: 404, body: { error: '체크 요청을 찾을 수 없습니다.' } };
  if (checkRows[0].submitted_time) return { status: 409, body: { error: '이미 제출되었습니다.' } };
  if (checkRows[0].skipped) return { status: 409, body: { error: '제외된 확인입니다.' } };
  if (Date.now() - new Date(checkRows[0].scheduled_time).getTime() > 5 * 60 * 1000) {
    return { status: 409, body: { error: '응답 시간이 지났습니다.' } };
  }
  const { rows: userRows } = await pool.query(
    'SELECT w.lat AS w_lat, w.lng AS w_lng, w.radius_m FROM users u JOIN workplaces w ON u.workplace_id = w.id WHERE u.id=$1',
    [userId]
  );
  const wp = userRows[0];
  const gpsCheck = validateGpsReport({ lat, lng, accuracyM, isMocked, maxAccuracyM: GPS_MAX_ACCURACY_M });
  const { withinRadius } = wp
    ? isWithinRadius({ lat, lng, workplaceLat: wp.w_lat, workplaceLng: wp.w_lng, radiusM: wp.radius_m })
    : { withinRadius: null };
  await pool.query(
    `UPDATE random_location_checks
     SET submitted_time=now(), lat=$1, lng=$2, accuracy_m=$3, is_within_radius=$4, mock_location_detected=$5
     WHERE id=$6`,
    [lat, lng, accuracyM, withinRadius, !gpsCheck.isValid, checkId]
  );
  return { status: 200, body: { success: true, withinRadius, gpsValid: gpsCheck.isValid } };
}

// POST /api/random-check/native-submit — 백그라운드(네이티브)에서 푸시 토큰으로 위치 제출
router.post('/native-submit',
  [body('t').isString().notEmpty(), body('lat').isFloat(), body('lng').isFloat()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    let payload: any;
    try { payload = jwt.verify(req.body.t, process.env.JWT_SECRET as string); }
    catch { res.status(401).json({ error: '유효하지 않은 토큰입니다.' }); return; }
    if (payload.purpose !== 'rc' || !payload.checkId || !payload.uid) {
      res.status(401).json({ error: '잘못된 토큰입니다.' }); return;
    }
    const accuracyM = typeof req.body.accuracyM === 'number' ? req.body.accuracyM : 0;
    const isMocked = req.body.isMocked === true;
    const r = await recordCheckLocation(payload.checkId, payload.uid, req.body.lat, req.body.lng, accuracyM, isMocked);
    res.status(r.status).json(r.body);
  }
);

// GET /api/random-check/today-tokens
// iOS 백그라운드 수집용: 오늘 아직 제출하지 않은 슬롯 목록과, 각 슬롯 전용 단기 서명 토큰(t)을 반환한다.
// (iOS는 무음 푸시로 시각에 맞춰 깨울 수 없으므로, 출근 시 토큰을 받아 네이티브가 해당 시각에 제출한다.)
router.get('/today-tokens', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, scheduled_time FROM random_location_checks
     WHERE user_id=$1 AND date=(now() AT TIME ZONE 'Asia/Seoul')::date
       AND skipped=FALSE AND submitted_time IS NULL
     ORDER BY scheduled_time`,
    [req.user.userId]
  );
  const slots = rows.map((r: any) => {
    // 각 토큰은 해당 슬롯 마감(시각+5분) 직후(+6분)까지만 유효
    const expSec = Math.floor(new Date(r.scheduled_time).getTime() / 1000) + 6 * 60;
    const t = jwt.sign(
      { checkId: r.id, uid: req.user.userId, purpose: 'rc' },
      process.env.JWT_SECRET as string,
      { expiresIn: Math.max(60, expSec - Math.floor(Date.now() / 1000)) }
    );
    return { checkId: r.id, scheduledTime: r.scheduled_time, t };
  });
  res.json({ slots });
});

// GET /api/random-check/pending
router.get('/pending', requireAuth, async (req: Request, res: Response): Promise<void> => {
  // 활성화(notification_sent)된 슬롯 중, 스킵되지 않고 미제출이며
  // 마감(슬롯 시각 + 5분) 이내인 것만 반환한다. 5분이 지나면 미응답으로 확정되어 더 이상 수집하지 않는다.
  const { rows } = await pool.query(
    `SELECT id, scheduled_time AS "scheduledTime" FROM random_location_checks
     WHERE user_id=$1 AND notification_sent=TRUE AND skipped=FALSE AND submitted_time IS NULL
       AND scheduled_time > now() - interval '5 minutes'
     ORDER BY scheduled_time DESC LIMIT 1`,
    [req.user.userId]
  );
  res.json({ pending: rows[0] || null });
});

// POST /api/random-check/:checkId/submit
router.post('/:checkId/submit', requireAuth,
  [body('lat').isFloat(), body('lng').isFloat(), body('accuracyM').isFloat(), body('isMocked').isBoolean()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { lat, lng, accuracyM, isMocked } = req.body;
    const { checkId } = req.params;

    const { rows: checkRows } = await pool.query(
      'SELECT * FROM random_location_checks WHERE id=$1 AND user_id=$2', [checkId, req.user.userId]
    );
    if (checkRows.length === 0) { res.status(404).json({ error: '체크 요청을 찾을 수 없습니다.' }); return; }
    if (checkRows[0].submitted_time) { res.status(409).json({ error: '이미 제출되었습니다.' }); return; }
    if (checkRows[0].skipped) { res.status(409).json({ error: '제외된 확인입니다.' }); return; }
    // 마감(슬롯 시각 + 5분) 초과 시 미응답으로 확정 — 제출 거부
    if (Date.now() - new Date(checkRows[0].scheduled_time).getTime() > 5 * 60 * 1000) {
      res.status(409).json({ error: '응답 시간이 지났습니다.' }); return;
    }

    const { rows: userRows } = await pool.query(
      'SELECT w.lat AS w_lat, w.lng AS w_lng, w.radius_m FROM users u JOIN workplaces w ON u.workplace_id = w.id WHERE u.id=$1',
      [req.user.userId]
    );
    const wp = userRows[0];

    const gpsCheck = validateGpsReport({ lat, lng, accuracyM, isMocked, maxAccuracyM: GPS_MAX_ACCURACY_M });
    const { withinRadius } = wp
      ? isWithinRadius({ lat, lng, workplaceLat: wp.w_lat, workplaceLng: wp.w_lng, radiusM: wp.radius_m })
      : { withinRadius: null };

    await pool.query(
      `UPDATE random_location_checks
       SET submitted_time=now(), lat=$1, lng=$2, accuracy_m=$3, is_within_radius=$4, mock_location_detected=$5
       WHERE id=$6`,
      [lat, lng, accuracyM, withinRadius, !gpsCheck.isValid, checkId]
    );

    res.json({ success: true, withinRadius, gpsValid: gpsCheck.isValid });
  }
);

export default router;

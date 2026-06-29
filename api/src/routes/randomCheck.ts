import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { isWithinRadius, validateGpsReport } from '../utils/geo';
import { requireAuth } from '../middleware/auth';

const router = Router();
const GPS_MAX_ACCURACY_M = parseFloat(process.env.GPS_MAX_ACCURACY_M || '50');

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

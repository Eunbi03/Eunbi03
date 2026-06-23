import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { generateAccessToken, generateRefreshToken, hashToken, getRefreshTokenExpiry } from '../utils/authTokens';
import { notifyHRTeam } from '../services/notificationService';
import { requireAuth } from '../middleware/auth';

const router = Router();
const MAX_FAILED = parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5', 10);

async function logAttempt(data: {
  userId?: string; email: string; deviceId: string;
  success: boolean; failReason?: string; req: Request;
}) {
  await pool.query(
    `INSERT INTO login_attempts (user_id, email_tried, device_id, success, fail_reason, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [data.userId || null, data.email, data.deviceId, data.success, data.failReason || null, data.req.ip, data.req.headers['user-agent']]
  );
}

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty(),
    body('deviceId').notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { email, password, deviceId } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    if (rows.length === 0) {
      await logAttempt({ email, deviceId, success: false, failReason: 'USER_NOT_FOUND', req });
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }); return;
    }
    const user = rows[0];

    if (user.is_locked) {
      await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'ACCOUNT_LOCKED', req });
      res.status(403).json({ error: '계정이 잠겼습니다. 인적자원팀에 문의하세요.' }); return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    const isDeviceMismatch = Boolean(user.device_id) && user.device_id !== deviceId;

    if (!passwordMatch || isDeviceMismatch) {
      const newFailCount = user.failed_login_attempts + 1;
      const shouldLock = newFailCount >= MAX_FAILED;
      const failReason = isDeviceMismatch ? 'DEVICE_MISMATCH' : 'WRONG_PASSWORD';

      await pool.query(
        `UPDATE users SET failed_login_attempts=$1, is_locked=$2, locked_reason=$3,
         locked_at=CASE WHEN $2 THEN now() ELSE locked_at END WHERE id=$4`,
        [newFailCount, shouldLock, shouldLock ? '5회 이상 로그인 실패' : null, user.id]
      );
      await logAttempt({ userId: user.id, email, deviceId, success: false, failReason, req });
      if (shouldLock) await notifyHRTeam(user.id, user.name, '5회 이상 로그인 실패로 계정이 잠겼습니다.');

      if (isDeviceMismatch) {
        res.status(403).json({ error: '등록되지 않은 기기입니다.', remainingAttempts: Math.max(0, MAX_FAILED - newFailCount) }); return;
      }
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.', remainingAttempts: Math.max(0, MAX_FAILED - newFailCount) }); return;
    }

    if (!user.device_id) {
      await pool.query('UPDATE users SET device_id=$1, device_registered_at=now() WHERE id=$2', [deviceId, user.id]);
    }

    const { plainToken, tokenHash } = generateRefreshToken();
    await pool.query(
      'UPDATE users SET failed_login_attempts=0, refresh_token_hash=$1, refresh_token_expires_at=$2 WHERE id=$3',
      [tokenHash, getRefreshTokenExpiry(), user.id]
    );
    await logAttempt({ userId: user.id, email, deviceId, success: true, req });

    res.json({
      accessToken: generateAccessToken({ userId: user.id, role: user.role }),
      refreshToken: plainToken,
      user: { id: user.id, name: user.name, role: user.role, mustChangePassword: user.must_change_password, locationConsentGiven: user.location_consent_given },
    });
  }
);

// POST /api/auth/auto-login
router.post('/auto-login',
  [body('userId').isUUID(), body('deviceId').notEmpty(), body('refreshToken').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { userId, deviceId, refreshToken } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND is_active=TRUE', [userId]);
    if (rows.length === 0) { res.status(404).json({ error: '계정 정보가 없습니다.' }); return; }
    const user = rows[0];

    if (user.is_locked) { res.status(403).json({ error: '계정이 잠겨 있습니다.' }); return; }
    if (!user.device_id || user.device_id !== deviceId) { res.status(403).json({ error: '기기 정보가 일치하지 않습니다.' }); return; }

    const tokenHash = hashToken(refreshToken);
    const isExpired = user.refresh_token_expires_at && new Date(user.refresh_token_expires_at) < new Date();
    if (!user.refresh_token_hash || user.refresh_token_hash !== tokenHash || isExpired) {
      res.status(403).json({ error: '로그인 세션이 만료되었습니다.' }); return;
    }

    res.json({
      accessToken: generateAccessToken({ userId: user.id, role: user.role }),
      user: { id: user.id, name: user.name, role: user.role, mustChangePassword: user.must_change_password, locationConsentGiven: user.location_consent_given },
    });
  }
);

// POST /api/auth/register (관리자 전용 직원 계정 생성)
router.post('/register',
  requireAuth,
  [body('email').isEmail(), body('name').notEmpty(), body('role').optional().isIn(['worker', 'admin', 'hr'])],
  async (req: Request, res: Response): Promise<void> => {
    if (req.user.role !== 'admin' && req.user.role !== 'hr') { res.status(403).json({ error: '권한이 없습니다.' }); return; }
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    const { email, name, role = 'worker', corp, team, department, employeeId, scheduledStart, scheduledEnd, lunchStart, lunchEnd, workType, workplaceId } = req.body;

    const initialPassword = req.body.initialPassword || '초기비밀번호1234';
    const passwordHash = await bcrypt.hash(initialPassword, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (email, employee_id, password_hash, name, role, corp, team, department, scheduled_start, scheduled_end, lunch_start, lunch_end, work_type, workplace_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, email, name, role`,
      [email, employeeId || null, passwordHash, name, role, corp || null, team || null, department || null,
       scheduledStart || '09:00', scheduledEnd || '18:00', lunchStart || '12:00', lunchEnd || '13:00',
       workType || null, workplaceId || null]
    );

    res.status(201).json({ success: true, user: rows[0] });
  }
);

// POST /api/auth/change-password
router.post('/change-password', requireAuth,
  [body('newPassword').isLength({ min: 8 })],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1, must_change_password=FALSE WHERE id=$2', [passwordHash, req.user.userId]);
    res.json({ success: true });
  }
);

// POST /api/auth/location-consent
router.post('/location-consent', requireAuth, async (req: Request, res: Response): Promise<void> => {
  await pool.query('UPDATE users SET location_consent_given=TRUE, location_consent_at=now() WHERE id=$1', [req.user.userId]);
  res.json({ success: true });
});

// POST /api/auth/device-change-request
router.post('/device-change-request', requireAuth,
  [body('newDeviceId').notEmpty(), body('reason').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    const { newDeviceId, reason } = req.body;
    const { rows } = await pool.query('SELECT device_id FROM users WHERE id=$1', [req.user.userId]);
    await pool.query(
      'INSERT INTO device_change_requests (user_id, old_device_id, new_device_id, reason) VALUES ($1,$2,$3,$4)',
      [req.user.userId, rows[0]?.device_id || null, newDeviceId, reason]
    );
    res.status(201).json({ success: true });
  }
);

// POST /api/auth/fcm-token
router.post('/fcm-token', requireAuth, [body('fcmToken').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    await pool.query('UPDATE users SET fcm_token=$1 WHERE id=$2', [req.body.fcmToken, req.user.userId]);
    res.json({ success: true });
  }
);

export default router;

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool';
import { generateAccessToken, generateRefreshToken, hashToken, getRefreshTokenExpiry } from '../utils/authTokens';
import { requireAuth } from '../middleware/auth';

const router = Router();
const MAX_FAILED = parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS || '5', 10);

// 이 기기(admin_devices)가 권한자 기기인지
async function deviceIsAuthority(userId: string, deviceId: string): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT is_authority FROM admin_devices WHERE user_id=$1 AND device_id=$2', [userId, deviceId]
  );
  return !!rows[0]?.is_authority;
}

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

// GET /api/auth/teams — 승인요청 화면(로그인 전)에서 권한 팀 선택 목록을 제공한다.
router.get('/teams', async (_req: Request, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT d.name AS division, t.name AS team
       FROM teams t JOIN divisions d ON d.id = t.division_id
      ORDER BY d.name, t.name`
  );
  res.json({ teams: rows });
});

// POST /api/auth/register-device-link — 기기 추가 초대 링크로 '이 기기'를 관리자 기기로 등록
router.post('/register-device-link',
  [body('t').isString().notEmpty(), body('deviceId').notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    let p: any;
    try { p = jwt.verify(req.body.t, process.env.JWT_SECRET as string); }
    catch { res.status(401).json({ error: '유효하지 않거나 만료된 링크입니다.' }); return; }
    if (p.purpose !== 'admin-device-invite' || !p.uid || !p.managerName) {
      res.status(401).json({ error: '잘못된 링크입니다.' }); return;
    }
    const deviceId = req.body.deviceId;
    // 이미 등록된 기기면 안내만
    const { rows: existing } = await pool.query('SELECT id FROM admin_devices WHERE device_id=$1 LIMIT 1', [deviceId]);
    if (existing.length > 0) { res.json({ alreadyRegistered: true }); return; }
    // 같은 관리자명이 이미 있으면 권한 공유(기존 그룹 권한 상속)
    const { rows: grp } = await pool.query(
      'SELECT can_read, can_write, scope_teams, corp, phone FROM admin_devices WHERE device_name=$1 LIMIT 1', [p.managerName]
    );
    let canRead = p.canRead !== false;
    let canWrite = p.canWrite === true;
    let teams = Array.isArray(p.teams) && p.teams.length ? p.teams : ['전체'];
    let corp = p.corp || null;
    let phone = p.phone || null;
    if (grp[0]) {
      canRead = grp[0].can_read; canWrite = grp[0].can_write;
      teams = grp[0].scope_teams || teams; corp = grp[0].corp || corp; phone = grp[0].phone || phone;
    }
    await pool.query(
      `INSERT INTO admin_devices (user_id, device_id, device_name, corp, phone, is_approved, approved_at, can_read, can_write, scope_teams)
       VALUES ($1,$2,$3,$4,$5,TRUE,now(),$6,$7,$8) ON CONFLICT (user_id, device_id) DO NOTHING`,
      [p.uid, deviceId, p.managerName, corp, phone, canRead, canWrite, teams]
    );
    res.json({ success: true, managerName: p.managerName });
  }
);

// POST /api/auth/login
router.post('/login',
  [
    body('password').notEmpty(),
    body('deviceId').notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    // 아이디: 근로자는 전화번호(하이픈 제외 11자리), 관리자는 이메일 — 둘 다 허용
    const { password, deviceId, deviceName } = req.body;
    const email = (req.body.username ?? req.body.email ?? '').trim();
    const digits = email.replace(/\D/g, '');
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE is_active = TRUE AND (
         LOWER(email) = LOWER($1)
         OR (char_length($2) >= 10 AND regexp_replace(phone, '\\D', '', 'g') = $2)
       )`,
      [email, digits]
    );
    if (rows.length === 0) {
      await logAttempt({ email, deviceId, success: false, failReason: 'USER_NOT_FOUND', req });
      res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }); return;
    }
    const user = rows[0];

    if (user.is_locked) {
      await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'ACCOUNT_LOCKED', req });
      res.status(403).json({ error: '계정이 잠겼습니다. 인적자원팀에 문의하세요.' }); return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      const newFailCount = user.failed_login_attempts + 1;
      const shouldLock = newFailCount >= MAX_FAILED;
      await pool.query(
        `UPDATE users SET failed_login_attempts=$1, is_locked=$2, locked_reason=$3,
         locked_at=CASE WHEN $2 THEN now() ELSE locked_at END WHERE id=$4`,
        [newFailCount, shouldLock, shouldLock ? '5회 이상 로그인 실패' : null, user.id]
      );
      await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'WRONG_PASSWORD', req });
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.', remainingAttempts: Math.max(0, MAX_FAILED - newFailCount) }); return;
    }

    const isAdminUser = user.role === 'admin' || user.role === 'hr';

    if (isAdminUser) {
      // 관리자: admin_devices 테이블에서 기기 확인
      const { rows: deviceRows } = await pool.query(
        'SELECT * FROM admin_devices WHERE user_id=$1 AND device_id=$2',
        [user.id, deviceId]
      );

      if (deviceRows.length > 0) {
        // 기기가 등록되어 있음
        if (!deviceRows[0].is_approved) {
          await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'DEVICE_PENDING', req });
          res.status(403).json({ error: '이 기기는 권한자의 승인을 기다리고 있습니다.', pendingApproval: true }); return;
        }
        // 승인된 기기 — 정상 진행
      } else {
        // 기기가 admin_devices에 없음
        const { rows: approvedDevices } = await pool.query(
          'SELECT id FROM admin_devices WHERE user_id=$1 AND is_approved=TRUE',
          [user.id]
        );

        if (approvedDevices.length === 0) {
          // 첫 번째 기기: 자동 승인 + 권한자 기기가 하나도 없으면 이 기기를 권한자로
          const { rows: anyAuth } = await pool.query('SELECT 1 FROM admin_devices WHERE is_authority=TRUE LIMIT 1');
          await pool.query(
            'INSERT INTO admin_devices (user_id, device_id, device_name, is_approved, approved_at, is_authority) VALUES ($1,$2,$3,TRUE,now(),$4)',
            [user.id, deviceId, deviceName || '첫 번째 기기', anyAuth.length === 0]
          );
        } else {
          // 추가 기기: 승인요청 화면에서 관리자명/업무용 전화번호/권한범위를 입력받아 등록한다.
          const managerName = (req.body.managerName ?? '').trim();
          const phone = (req.body.phone ?? '').trim();
          if (!managerName || !phone) {
            // 아직 정보 미입력 → 클라이언트에 승인요청 폼을 띄우도록 지시
            await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'NEW_DEVICE_FORM', req });
            res.status(403).json({ error: '등록되지 않은 기기입니다. 관리자 정보를 입력해 승인을 요청하세요.', needDeviceRequest: true }); return;
          }
          // 중복 관리자명 체크: 이미 등록된 관리자명으로는 스스로 등록할 수 없다(최고 관리자에게 요청).
          const { rows: dup } = await pool.query('SELECT 1 FROM admin_devices WHERE device_name=$1 LIMIT 1', [managerName]);
          if (dup.length > 0) {
            await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'DUPLICATE_MANAGER', req });
            res.status(409).json({ error: '이미 등록된 관리자입니다. 새로운 기기 등록을 원한다면 최고 관리자에게 요청해주세요.', duplicateManager: true }); return;
          }
          const canRead = req.body.canRead !== false;   // 기본 읽기 허용
          const canWrite = req.body.canWrite === true;
          const teams = Array.isArray(req.body.teams) && req.body.teams.length ? req.body.teams : ['전체'];
          await pool.query(
            `INSERT INTO admin_devices (user_id, device_id, device_name, phone, is_approved, can_read, can_write, scope_teams)
             VALUES ($1,$2,$3,$4,FALSE,$5,$6,$7) ON CONFLICT (user_id, device_id) DO NOTHING`,
            [user.id, deviceId, managerName, phone, canRead, canWrite, teams]
          );
          await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'NEW_DEVICE_PENDING', req });
          res.status(403).json({ error: '승인 요청이 전송되었습니다. 권한자의 승인 후 로그인할 수 있습니다.', pendingApproval: true }); return;
        }
      }
    } else {
      // 일반 직원: users.device_id 확인
      const isDeviceMismatch = Boolean(user.device_id) && user.device_id !== deviceId;
      if (isDeviceMismatch) {
        // 비밀번호는 맞았고 기기만 다른 경우 — 계정을 잠그지 않는다.
        // (폰 교체 등 정상 사용자가 잠기는 것을 방지. 기기 변경은 관리자가 초기화)
        await logAttempt({ userId: user.id, email, deviceId, success: false, failReason: 'DEVICE_MISMATCH', req });
        res.status(403).json({ error: '등록되지 않은 기기입니다. 인사팀에 기기 변경을 요청하세요.' }); return;
      }
      if (!user.device_id) {
        await pool.query('UPDATE users SET device_id=$1, device_registered_at=now() WHERE id=$2', [deviceId, user.id]);
      }
    }

    // 권한자 여부는 '이 기기(admin_devices)' 기준으로 판단
    const isAuthority = isAdminUser ? await deviceIsAuthority(user.id, deviceId) : false;

    const { plainToken, tokenHash } = generateRefreshToken();
    const refreshExpiry = getRefreshTokenExpiry();
    await pool.query('UPDATE users SET failed_login_attempts=0 WHERE id=$1', [user.id]);
    if (isAdminUser) {
      // 관리자: refresh 토큰을 이 기기(admin_devices) 행에 저장 → 기기마다 독립적으로 자동로그인 유지
      await pool.query(
        'UPDATE admin_devices SET refresh_token_hash=$1, refresh_token_expires_at=$2 WHERE user_id=$3 AND device_id=$4',
        [tokenHash, refreshExpiry, user.id, deviceId]
      );
    } else {
      // 일반 직원: 단일 기기이므로 users 행에 저장
      await pool.query(
        'UPDATE users SET refresh_token_hash=$1, refresh_token_expires_at=$2 WHERE id=$3',
        [tokenHash, refreshExpiry, user.id]
      );
    }
    await logAttempt({ userId: user.id, email, deviceId, success: true, req });

    res.json({
      accessToken: generateAccessToken({ userId: user.id, role: user.role, deviceId, isAuthority }),
      refreshToken: plainToken,
      user: {
        id: user.id, name: user.name, role: user.role,
        mustChangePassword: user.must_change_password,
        locationConsentGiven: user.location_consent_given,
        isAuthorityHolder: isAuthority,
      },
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

    const isAdminUser = user.role === 'admin' || user.role === 'hr';
    const tokenHash = hashToken(refreshToken);
    // 검증할 토큰 해시/만료: 관리자는 기기(admin_devices)별, 일반 직원은 users 기준
    let storedHash: string | null;
    let storedExpiry: Date | string | null;
    if (isAdminUser) {
      // 관리자: 이 기기가 승인되어 있고, 그 기기에 저장된 refresh 토큰과 일치해야 함
      const { rows: deviceRows } = await pool.query(
        'SELECT refresh_token_hash, refresh_token_expires_at FROM admin_devices WHERE user_id=$1 AND device_id=$2 AND is_approved=TRUE',
        [userId, deviceId]
      );
      if (deviceRows.length === 0) { res.status(403).json({ error: '기기 정보가 일치하지 않거나 승인되지 않았습니다.' }); return; }
      storedHash = deviceRows[0].refresh_token_hash;
      storedExpiry = deviceRows[0].refresh_token_expires_at;
    } else {
      if (!user.device_id || user.device_id !== deviceId) { res.status(403).json({ error: '기기 정보가 일치하지 않습니다.' }); return; }
      storedHash = user.refresh_token_hash;
      storedExpiry = user.refresh_token_expires_at;
    }

    const isExpired = storedExpiry && new Date(storedExpiry) < new Date();
    if (!storedHash || storedHash !== tokenHash || isExpired) {
      res.status(403).json({ error: '로그인 세션이 만료되었습니다.' }); return;
    }

    const isAuthority = isAdminUser ? await deviceIsAuthority(user.id, deviceId) : false;
    res.json({
      accessToken: generateAccessToken({ userId: user.id, role: user.role, deviceId, isAuthority }),
      user: {
        id: user.id, name: user.name, role: user.role,
        mustChangePassword: user.must_change_password,
        locationConsentGiven: user.location_consent_given,
        isAuthorityHolder: isAuthority,
      },
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
  [body('newPassword').matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/).withMessage('비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.')],
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

export default router;

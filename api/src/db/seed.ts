import 'dotenv/config';
import bcrypt from 'bcrypt';
import { pool } from './pool';

/**
 * 최초 관리자(HR) 계정을 생성합니다.
 * 이미 같은 이메일의 계정이 있으면 건너뜁니다.
 *
 * 환경변수:
 *   SEED_ADMIN_EMAIL    (기본값 admin@example.com)
 *   SEED_ADMIN_PASSWORD (기본값 admin1234)
 *   SEED_ADMIN_NAME     (기본값 시스템관리자)
 */
async function seed() {
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin1234';
  const name = process.env.SEED_ADMIN_NAME || '시스템관리자';

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length > 0) {
    console.log(`[seed] 이미 존재하는 계정입니다: ${email} — 건너뜁니다.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role, must_change_password, location_consent_given)
     VALUES ($1, $2, $3, 'hr', TRUE, FALSE)`,
    [email, passwordHash, name]
  );

  console.log('[seed] 최초 HR 관리자 계정 생성 완료');
  console.log(`        이메일:   ${email}`);
  console.log(`        비밀번호: ${password}  (최초 로그인 시 변경 필요)`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] FAILED:', err);
    process.exit(1);
  });

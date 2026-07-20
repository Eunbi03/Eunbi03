-- 관리자 다기기 자동로그인: refresh 토큰을 기기(admin_devices)별로 저장한다.
-- (기존에는 users에 1개만 저장해, 다른 기기에서 로그인하면 이전 기기 자동로그인이 끊겼음)
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

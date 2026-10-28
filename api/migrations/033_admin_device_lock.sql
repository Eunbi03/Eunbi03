-- 관리자 계정은 공용(1개 user)이라, 로그인 실패 잠금을 '기기(admin_devices)' 단위로 둔다.
-- 한 기기가 비번을 많이 틀려도 그 기기만 잠기고, 다른 관리자 기기는 영향 없음.
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS locked_reason TEXT;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

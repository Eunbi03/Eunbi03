-- 관리자 권한자 플래그
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_authority_holder BOOLEAN NOT NULL DEFAULT FALSE;

-- 관리자 다중 기기 테이블
CREATE TABLE IF NOT EXISTS admin_devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  device_name TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- 기존 admin/hr 계정의 device_id를 admin_devices로 이관
INSERT INTO admin_devices (user_id, device_id, device_name, is_approved, approved_at)
SELECT id, device_id, '기존 등록 기기', TRUE, now()
FROM users
WHERE device_id IS NOT NULL AND role IN ('admin', 'hr')
ON CONFLICT (user_id, device_id) DO NOTHING;

-- 최초 등록 admin을 권한자로 설정 (없으면 아무것도 안 함)
UPDATE users SET is_authority_holder = TRUE
WHERE id = (
  SELECT id FROM users
  WHERE role = 'admin' AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
);

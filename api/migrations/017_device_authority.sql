-- 권한자를 '계정(user)' 단위가 아니라 '기기(사람)' 단위로 관리한다.
-- 같은 관리자 계정에 여러 사람이 각자 기기로 로그인하며, 그 중 정확히 1개 기기만 권한자다.
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS is_authority BOOLEAN NOT NULL DEFAULT FALSE;

-- 최초 등록(가장 오래된) 기기를 권한자로 설정 (아직 권한자 기기가 없을 때만)
UPDATE admin_devices SET is_authority = TRUE
WHERE id = (SELECT id FROM admin_devices ORDER BY created_at ASC, id ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM admin_devices WHERE is_authority = TRUE);

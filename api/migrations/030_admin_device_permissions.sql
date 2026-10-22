-- 관리자 기기 권한 세분화: can_write(단일) → permissions(복수 선택) 으로 확장.
-- 권한 키: 'staff'(직원관리 쓰기), 'report_leave'(개별리포트 발송+연차 인정),
--          'report_full'(개별리포트 발송+연차+출퇴근+노트 인정), 'settings'(설정 쓰기).
-- 아무 키도 없으면 읽기 전용. 권한자(is_authority)는 키와 무관하게 전부 허용.
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';

-- 기존 쓰기권한(can_write=TRUE) 기기는 전체 권한을 부여해 기존 동작을 유지한다.
UPDATE admin_devices
SET permissions = ARRAY['staff','report_full','settings']
WHERE can_write = TRUE
  AND (permissions IS NULL OR array_length(permissions, 1) IS NULL);

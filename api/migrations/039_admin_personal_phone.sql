-- 관리자 전화번호 분리:
--   phone          = 업무용 전화(외부 노출용: 리포트/문자 {managers})
--   personal_phone = 본인 휴대전화(관리자↔근로자 매칭용)
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS personal_phone TEXT;

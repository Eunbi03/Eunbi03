-- 등록 기기별 담당자 정보: 담당 법인 + 전화번호 (담당자명은 device_name 재사용)
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS corp TEXT;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS phone TEXT;

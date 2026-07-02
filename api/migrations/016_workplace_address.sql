-- 근무지 주소 정보 (카카오 주소검색 결과 저장)
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS postal_code    VARCHAR(10);
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS detail_address TEXT;

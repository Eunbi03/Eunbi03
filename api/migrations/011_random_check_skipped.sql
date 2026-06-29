-- 출근 직후 2시간 이내라 발송이 스킵된 랜덤 확인 슬롯을 구분하기 위한 컬럼.
-- skipped=TRUE 인 슬롯은 "미응답"이 아니라 "제외"로 취급한다(근로자 책임 아님).
ALTER TABLE random_location_checks ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT FALSE;

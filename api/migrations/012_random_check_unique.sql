-- 동일 사용자·동일 시각 슬롯 중복 생성 방지.
-- 일일 생성 작업(05:00)이 두 번 실행돼도 ON CONFLICT DO NOTHING 이 실제로 동작하도록 한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_random_check_user_time
  ON random_location_checks(user_id, scheduled_time);

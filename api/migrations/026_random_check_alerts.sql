-- 랜덤 위치 확인: 미수집 시 "보이는 알림"을 2분 간격으로 최대 10회 재발송하기 위한 컬럼.
-- 수집(submitted_time)이 완료되면 재발송을 멈춘다.
-- alert_count  : 지금까지 보낸 보이는 알림 횟수 (최대 10)
-- last_alert_at : 마지막 보이는 알림 발송 시각 (2분 간격 페이싱용)
ALTER TABLE random_location_checks ADD COLUMN IF NOT EXISTS alert_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE random_location_checks ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS random_location_checks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                    DATE NOT NULL,
  scheduled_time          TIMESTAMPTZ NOT NULL,

  submitted_time          TIMESTAMPTZ,
  lat                     DOUBLE PRECISION,
  lng                     DOUBLE PRECISION,
  accuracy_m              DOUBLE PRECISION,
  is_within_radius        BOOLEAN,
  mock_location_detected  BOOLEAN NOT NULL DEFAULT FALSE,

  notification_sent       BOOLEAN NOT NULL DEFAULT FALSE,

  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_random_check_user_date ON random_location_checks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_random_check_scheduled ON random_location_checks(scheduled_time) WHERE notification_sent = FALSE;

CREATE TABLE IF NOT EXISTS outing_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id  UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  start_time            TIMESTAMPTZ NOT NULL,
  start_lat             DOUBLE PRECISION NOT NULL,
  start_lng             DOUBLE PRECISION NOT NULL,

  destination           TEXT NOT NULL,
  reason                TEXT NOT NULL,

  end_time              TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outing_attendance ON outing_records(attendance_record_id);
CREATE INDEX IF NOT EXISTS idx_outing_user ON outing_records(user_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date               DATE NOT NULL,

  check_in_time      TIMESTAMPTZ,
  check_in_lat       DOUBLE PRECISION,
  check_in_lng       DOUBLE PRECISION,
  check_in_location_verified BOOLEAN,

  check_out_time     TIMESTAMPTZ,
  check_out_lat      DOUBLE PRECISION,
  check_out_lng      DOUBLE PRECISION,
  check_out_is_field BOOLEAN DEFAULT FALSE,

  work_minutes       NUMERIC(8, 2),

  status             VARCHAR(20) DEFAULT '정상' CHECK (status IN ('정상', '지각', '조퇴', '결근', '지각조퇴')),

  daily_report       TEXT,
  tomorrow_plan      TEXT,
  report_locked      BOOLEAN NOT NULL DEFAULT FALSE,

  temp_time_change_requested_end TIME,
  temp_time_change_reason        TEXT,
  temp_time_change_status        VARCHAR(20) CHECK (temp_time_change_status IN ('pending', 'approved', 'rejected')),
  temp_time_change_approved_by   UUID REFERENCES users(id),
  temp_time_change_at            TIMESTAMPTZ,

  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(status) WHERE status != '정상';

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON attendance_records;
CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

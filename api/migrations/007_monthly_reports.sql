CREATE TABLE IF NOT EXISTS monthly_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month            VARCHAR(7) NOT NULL,

  late_count            INT NOT NULL DEFAULT 0,
  early_leave_count     INT NOT NULL DEFAULT 0,
  missing_clock_count   INT NOT NULL DEFAULT 0,
  missing_report_count  INT NOT NULL DEFAULT 0,
  total_violations      INT NOT NULL DEFAULT 0,
  reprimand_required    BOOLEAN NOT NULL DEFAULT FALSE,

  sent_at               TIMESTAMPTZ,
  sent_via              VARCHAR(20),
  send_failed           BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(year_month);

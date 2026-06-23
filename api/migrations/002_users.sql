CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  VARCHAR(255) UNIQUE NOT NULL,
  employee_id            VARCHAR(50) UNIQUE,
  password_hash          VARCHAR(255) NOT NULL,
  name                   VARCHAR(100) NOT NULL,
  corp                   VARCHAR(100),
  team                   VARCHAR(100),
  department             VARCHAR(100),
  role                   VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('worker', 'admin', 'hr')),
  work_type              VARCHAR(50),
  workplace_id           UUID REFERENCES workplaces(id),
  scheduled_start        TIME NOT NULL DEFAULT '09:00',
  scheduled_end          TIME NOT NULL DEFAULT '18:00',
  lunch_start            TIME NOT NULL DEFAULT '12:00',
  lunch_end              TIME NOT NULL DEFAULT '13:00',

  device_id              VARCHAR(255),
  device_registered_at   TIMESTAMPTZ,
  refresh_token_hash     VARCHAR(255),
  refresh_token_expires_at TIMESTAMPTZ,
  fcm_token              VARCHAR(255),

  failed_login_attempts  INT NOT NULL DEFAULT 0,
  is_locked              BOOLEAN NOT NULL DEFAULT FALSE,
  locked_reason          TEXT,
  locked_at              TIMESTAMPTZ,

  must_change_password   BOOLEAN NOT NULL DEFAULT TRUE,
  location_consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  location_consent_at    TIMESTAMPTZ,

  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_corp_team ON users(corp, team);
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

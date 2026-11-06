-- 유동 근무시간: 근무일·근무시간 모두 불규칙한 근로자가 직접 '근무 관리'에서 등록.
-- users.flex_schedule: 유동 근무시간 대상 여부 (비정기적 근로자와 상호배타 — 애플리케이션에서 보장)
ALTER TABLE users ADD COLUMN IF NOT EXISTS flex_schedule BOOLEAN NOT NULL DEFAULT FALSE;

-- 유동 근무자가 등록하는 '날짜별 근무 일정'. 휴게시간은 없음(출근·퇴근만).
CREATE TABLE IF NOT EXISTS worker_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_worker_schedules_user_date ON worker_schedules(user_id, work_date);

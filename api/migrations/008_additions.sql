BEGIN;

-- ── 사용자 테이블 확장 ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone     VARCHAR(20);   -- 전화번호 (초기 비번)
ALTER TABLE users ADD COLUMN IF NOT EXISTS division  VARCHAR(100);  -- 본부
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);  -- 직무

-- ── 출퇴근 기록 확장 ────────────────────────────────────────────
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_distance_m  NUMERIC(10,1); -- 출근지까지 거리(m)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_distance_m NUMERIC(10,1); -- 퇴근지까지 거리(m)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_note_in    TEXT;              -- 출근 장소 (기본: 근무지)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_note_out   TEXT;              -- 퇴근 장소 (기본: 근무지)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_note_field TEXT;              -- 외근 장소 (선택)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_note_today TEXT;              -- 오늘 한 업무 (필수)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS leave_type      VARCHAR(20);       -- '연차'|'반차'|'반반차'

-- ── 근무지 테이블 보완 ──────────────────────────────────────────
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     DEFAULT TRUE;
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

COMMIT;

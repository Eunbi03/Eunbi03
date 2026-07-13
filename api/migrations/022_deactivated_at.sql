-- 직원 소프트 삭제 시각 (재등록 시 1년 보존 판단용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

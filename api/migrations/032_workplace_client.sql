-- 근무지를 '거래처(client) > 지점(branch)'로 묶어 관리.
-- client_name: 거래처명, branch_name: 지점명(단일 지점이면 NULL/빈값).
-- name 컬럼은 기존 호환(근로자 배정·외근·매칭 키)을 위해 유지하며,
-- "거래처명 + 지점명" 조합으로 채운다.
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE workplaces ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- 기존 근무지는 단일 지점으로 간주: 거래처명 = 기존 이름, 지점명 없음.
UPDATE workplaces SET client_name = name WHERE client_name IS NULL OR client_name = '';

CREATE INDEX IF NOT EXISTS idx_workplaces_client ON workplaces(client_name) WHERE is_active = TRUE;

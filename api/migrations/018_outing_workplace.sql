-- 외근 목적지를 등록된 근무지로 선택한 경우, 근무지 참조 + 거리(m) 저장
ALTER TABLE outing_records ADD COLUMN IF NOT EXISTS workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL;
ALTER TABLE outing_records ADD COLUMN IF NOT EXISTS distance_m DOUBLE PRECISION;

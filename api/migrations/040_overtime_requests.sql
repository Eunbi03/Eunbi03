-- 연장 근무 신청/승인 (다건, 연장일별 1건)
CREATE TABLE IF NOT EXISTS overtime_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date    DATE NOT NULL,                 -- 연장 근무일
  start_time   TIME NOT NULL,                 -- 연장 시작
  end_time     TIME NOT NULL,                 -- 연장 종료
  place        TEXT NOT NULL,                 -- 연장 근무지(직접입력 포함)
  workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL, -- 등록 근무지 선택 시
  purpose      TEXT NOT NULL,                 -- 연장 근무 목적
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT,                         -- 자동/수동 반려 사유(선택)
  decided_by   UUID REFERENCES users(id),     -- 승인/반려한 관리자(공용계정 user)
  decided_by_name TEXT,                        -- 승인/반려 관리자명(표시용)
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, work_date)                 -- 하루 1건
);
CREATE INDEX IF NOT EXISTS idx_overtime_user ON overtime_requests(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_overtime_status ON overtime_requests(status) WHERE status='pending';

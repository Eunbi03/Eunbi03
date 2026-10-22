-- 관리자 작업 기록(감사 로그): 어떤 관리자가 무엇을 추가/수정/삭제했는지 기록한다.
-- 보관 기간 1년(스케줄러가 매일 1년 지난 기록을 자동 삭제).
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_name  TEXT,                       -- 작업한 관리자명(기기 device_name)
  device_id   TEXT,                       -- 작업한 기기코드
  action      TEXT NOT NULL,              -- 추가 / 수정 / 삭제 / 발송 / 인정 / 승인 등
  entity      TEXT NOT NULL,              -- 직원 / 법인 / 본부 / 팀 / 직책 / 근무시간 / 공휴일 / 근무지 / 메시지 / 기기 / 리포트 / 근태
  target_name TEXT,                       -- 대상 이름(근로자명/팀명 등)
  detail      TEXT,                       -- 추가 설명(선택)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs (admin_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_name);

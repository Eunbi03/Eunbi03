-- 자율 메시지 첨부파일(PDF/PNG/JPG). 파일 자체를 DB에 저장하고 공개 다운로드 링크로 제공.
-- 이메일은 실제 첨부 + 링크, 문자는 링크. 30일 경과 시 스케줄러가 자동 삭제.
CREATE TABLE IF NOT EXISTS message_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size         INT  NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

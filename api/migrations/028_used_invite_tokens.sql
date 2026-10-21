-- 기기 등록 초대 링크 1회용 처리: 한 초대 링크(nonce)로는 기기 하나만 등록되도록 사용 기록을 남긴다.
-- (같은 기기라도 인앱 브라우저/사파리 등 환경에 따라 device_id가 달라져 한 링크로 여러 기기가 등록되던 문제 방지)
CREATE TABLE IF NOT EXISTS used_invite_tokens (
  nonce      TEXT PRIMARY KEY,
  device_id  TEXT,
  used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

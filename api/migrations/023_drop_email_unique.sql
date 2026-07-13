-- 이메일 중복 검사를 하지 않으므로 email UNIQUE 제약 제거 (전화번호 기준으로만 관리)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

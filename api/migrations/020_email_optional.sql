-- 이메일은 선택 입력 항목이므로 NOT NULL 제약을 제거한다.
-- (UNIQUE 제약은 유지 — PostgreSQL은 NULL 값의 중복을 허용하므로 미입력 근로자에는 영향 없음)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 혹시 빈 문자열('')로 들어온 이메일은 NULL로 정규화 (UNIQUE 충돌 방지)
UPDATE users SET email = NULL WHERE email = '';

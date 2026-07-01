-- 직원 관리 개편: 직책(position), 비고(remark), 근무노트 제외(note_exempt), 비정기적 근로자(irregular_worker)
-- 로그인/정보연결 키가 이메일 → 전화번호(하이픈 제외 11자리)로 변경됨에 따라 전화번호 숫자 인덱스도 추가.
ALTER TABLE users ADD COLUMN IF NOT EXISTS position         VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS remark           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS note_exempt      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS irregular_worker BOOLEAN NOT NULL DEFAULT FALSE;

-- 전화번호에서 숫자만 추출한 값으로 조회(로그인·재활성화 연결)하기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_users_phone_digits ON users ((regexp_replace(phone, '\D', '', 'g')));

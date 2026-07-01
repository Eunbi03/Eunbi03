-- 조직 마스터 데이터(설정 페이지에서 관리): 법인 / 본부·팀 / 직책 / 근무시간(직무 프리셋)
-- 직원(users)은 기존처럼 corp/division/team/job_title 텍스트를 그대로 저장하되,
-- 각 드롭다운 후보는 아래 마스터 테이블에서 가져온다. 본부-팀은 상하관계(team.division_id).

CREATE TABLE IF NOT EXISTS corporations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(150) NOT NULL UNIQUE,
  address    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS divisions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(division_id, name)
);

CREATE TABLE IF NOT EXISTS positions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 근무시간(직무 프리셋): 직원 추가 시 '직무'를 고르면 출퇴근/휴게 시간이 자동 입력된다.
CREATE TABLE IF NOT EXISTS job_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,   -- 직무명
  work_start  TIME NOT NULL DEFAULT '09:00',
  work_end    TIME NOT NULL DEFAULT '18:00',
  break_start TIME NOT NULL DEFAULT '12:00',
  break_end   TIME NOT NULL DEFAULT '13:00',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 초기 데이터 ─────────────────────────────────────────────
-- 법인
INSERT INTO corporations (name, address) VALUES
  ('케이프라이드',       '강원특별자치도 횡성군 우천면 우천제2농공단지로 65-50, 1층'),
  ('보담',               '강원특별자치도 원주시 저금어지길 456, 2층 (가현동, 강원엘피씨)'),
  ('백두대간영농조합법인','강원특별자치도 강릉시 정원로 54, 8층 (교동, 주니어타운)'),
  ('마시타',             '강원특별자치도 강릉시 정원로 54, 8층 (교동, 주니어타운)'),
  ('케이펙',             '강원특별자치도 횡성군 우천면 우천제2농공단지로 65-50, 1층')
ON CONFLICT (name) DO NOTHING;

-- 본부
INSERT INTO divisions (name) VALUES
  ('식육사업본부'), ('신선생산부'), ('M본부'), ('가공생산부'),
  ('경영자원본부'), ('SCM팀'), ('자금회계')
ON CONFLICT (name) DO NOTHING;

-- 팀 (본부에 종속)
INSERT INTO teams (division_id, name)
SELECT d.id, t.name FROM divisions d
JOIN (VALUES
  ('식육사업본부','EH팀'),
  ('신선생산부','신선생산과'), ('신선생산부','상품생산과'),
  ('M본부','M팀'), ('M본부','S팀'), ('M본부','I팀'),
  ('가공생산부','품질관리팀'), ('가공생산부','가공생산과'), ('가공생산부','가열생산과'),
  ('경영자원본부','경영지원팀'), ('경영자원본부','인적자원팀'),
  ('경영자원본부','유통지원팀'), ('경영자원본부','공무팀')
) AS t(division_name, name) ON t.division_name = d.name
ON CONFLICT (division_id, name) DO NOTHING;

-- 근무시간(직무)
INSERT INTO job_schedules (name, work_start, work_end, break_start, break_end) VALUES
  ('마케팅 1', '09:00','18:00','12:00','13:00'),
  ('마케팅 2', '08:00','17:00','11:30','12:30'),
  ('지원',     '09:00','18:00','12:00','13:00'),
  ('생산직',   '08:00','17:00','11:30','12:30')
ON CONFLICT (name) DO NOTHING;

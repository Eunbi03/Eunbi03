-- 관리자 기기별 권한 범위(읽기/쓰기 + 권한 팀) 추가
-- 권한은 '기기(admin_devices)'에 붙는다. 같은 device_name(관리자명)을 가진 기기들은
-- 한 사람으로 간주하여 정보수정 시 함께 동기화한다(애플리케이션 로직).
-- scope_teams: 이 관리자가 볼 수 있는 팀 목록. '전체'가 포함되면 모든 팀을 본다.
-- 권한자(is_authority) 또는 role='hr'은 scope와 무관하게 전체를 본다.

ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS can_read  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS can_write BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS scope_teams TEXT[] NOT NULL DEFAULT ARRAY['전체'];

-- 기존 등록 기기는 모두 '전체' 권한팀 + 읽기/쓰기 허용으로 둔다(현재 관리자는 전부 볼 수 있어야 함).
UPDATE admin_devices
SET scope_teams = ARRAY['전체']
WHERE scope_teams IS NULL OR array_length(scope_teams, 1) IS NULL;

-- 2번째 권한자 추가: 김희영 기기(2742bee0723a02df78e4e0e799fe7966)를 권한자로 설정.
-- (권한자는 승인된 상태여야 하므로 is_approved도 TRUE로 보장)
UPDATE admin_devices
SET is_authority = TRUE, is_approved = TRUE, approved_at = COALESCE(approved_at, now())
WHERE device_id = '2742bee0723a02df78e4e0e799fe7966';

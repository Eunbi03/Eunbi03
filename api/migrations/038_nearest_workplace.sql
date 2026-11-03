-- 기본 근무지 개념 제거 → 출퇴근 거리계산을 '등록된 모든 근무지 중 가장 가까운 곳' 기준으로.
--  check_in_location_verified / check_out_location_verified: 어느 근무지든 참고반경 이내면 TRUE(초록불)
--  check_in_distance_m / check_out_distance_m: 가장 가까운 근무지까지 거리(m) — 기존 컬럼 재사용
--  check_in_place / check_out_place: 가장 가까운 근무지명(관리자 화면 표시용)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_location_verified BOOLEAN;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_place  TEXT;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_place TEXT;

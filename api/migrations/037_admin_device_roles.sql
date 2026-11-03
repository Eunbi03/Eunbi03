-- 관리자 권한 모델 재설계: 역할(roles) 세분화 + 쓰기 권한 3종.
--
-- [역할] admin_devices.roles TEXT[] — 복수 선택 가능(단, 'general'은 단독).
--   'director' 본부장  → scope_divisions(담당 본부)에 속한 모든 팀을 읽음
--   'teamlead' 팀장    → scope_teams(담당 팀)를 읽음
--   'hr'       인적자원팀 → scope_corps(담당 법인) 소속 근로자를 읽음, 설정 쓰기 가능, 리포트 발송 가능
--   'general'  일반    → scope_teams(팀)를 읽음, 모든 쓰기 차단(읽기 전용)
--   (역할이 비어있으면 아무것도 보지 못함 = 보류 상태)
--   권한자(is_authority)는 역할/범위와 무관하게 전 권한·전 범위.
--
-- [쓰기 권한 3종] admin_devices.permissions TEXT[]:
--   'staff'(근로자관리), 'report'(개별리포트 인정), 'settings'(설정)
--   기존 4종('report_leave','report_full') → 'report' 로 통합.
--   'settings' 쓰기는 hr 역할 또는 권한자만 유효.
--   리포트 발송은 권한 키가 아니라 hr 역할 또는 권한자만 가능(별도 규칙).

ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS roles           TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS scope_divisions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_devices ADD COLUMN IF NOT EXISTS scope_corps     TEXT[] NOT NULL DEFAULT '{}';

-- 1) 권한 키 4종 → 3종 통합: report_leave/report_full → report
UPDATE admin_devices
SET permissions = (
  SELECT COALESCE(array_agg(DISTINCT CASE WHEN p IN ('report_leave','report_full') THEN 'report' ELSE p END), '{}')
  FROM unnest(permissions) AS p
  WHERE p IN ('staff','report_leave','report_full','report','settings')
)
WHERE permissions IS NOT NULL AND array_length(permissions, 1) IS NOT NULL;

-- 2) 기존 관리자 전환: 권한자(is_authority)만 그대로 유지, 나머지는 '보류'(역할 없음 → 아무것도 안 보임).
--    보류 상태에서는 범위/쓰기 권한이 의미가 없으므로 비워 둔다(로그인은 가능).
UPDATE admin_devices
SET roles = '{}', scope_divisions = '{}', scope_corps = '{}', permissions = '{}'
WHERE is_authority = FALSE;

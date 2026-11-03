// 관리자 기기 세부 "쓰기" 권한 키 (admin_devices.permissions).
// 빈 배열 = 쓰기 없음. 권한자(is_authority)는 키와 무관하게 전부 허용.
//   staff    : 근로자관리 쓰기
//   report   : 개별리포트 인정(연차/출퇴근/근무노트) — 발송은 별도 규칙(hr·권한자)
//   settings : 설정 쓰기 — hr 역할 또는 권한자만 유효
export const VALID_PERMS: string[] = ['staff', 'report', 'settings'];

// 관리자 역할 (admin_devices.roles). 복수 선택 가능하되 'general'은 단독만.
//   director : 본부장   → scope_divisions(담당 본부) 전체 팀 읽기
//   teamlead : 팀장     → scope_teams(담당 팀) 읽기
//   hr       : 인적자원팀 → scope_corps(담당 법인) 소속 근로자 읽기 + 설정 쓰기 + 리포트 발송
//   general  : 일반     → scope_teams(팀) 읽기, 모든 쓰기 차단(읽기 전용)
export const VALID_ROLES: string[] = ['director', 'teamlead', 'hr', 'general'];

// 입력값을 유효 키만 남긴 배열로 정규화.
export function normalizePerms(input: any): string[] {
  const arr = Array.isArray(input) ? input.map((x) => String(x)) : [];
  return VALID_PERMS.filter((k) => arr.includes(k));
}

// 역할 정규화. 'general'이 포함되면 단독(general)만 남긴다.
export function normalizeRoles(input: any): string[] {
  const arr = Array.isArray(input) ? input.map((x) => String(x)) : [];
  const roles = VALID_ROLES.filter((k) => arr.includes(k));
  if (roles.includes('general')) return ['general'];
  return roles;
}

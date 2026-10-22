// 관리자 기기 세부 권한 키 (admin_devices.permissions).
// 빈 배열 = 읽기 전용. 권한자(is_authority)는 키와 무관하게 전부 허용.
export const VALID_PERMS: string[] = ['staff', 'report_leave', 'report_full', 'settings'];

// 입력값을 유효 키만 남긴 배열로 정규화.
export function normalizePerms(input: any): string[] {
  const arr = Array.isArray(input) ? input.map((x) => String(x)) : [];
  return VALID_PERMS.filter((k) => arr.includes(k));
}

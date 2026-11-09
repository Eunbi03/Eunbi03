// 연장근무 승인 라우팅 공통 로직 (admin 화면 + 근로자 앱 바로가기/배지/알림이 같은 기준을 쓰도록).
//  - 일반 근로자 신청 → 담당 팀의 '팀장' 승인
//  - 팀장 신청 → 담당 본부의 '본부장' 승인
//  - 본부장 신청 → 자동 승인(승인 대상 아님)
import { pool } from '../db/pool';

const norm = (s: any) => String(s || '').replace(/\s/g, '');
const digits = (s: any) => String(s || '').replace(/\D/g, '');

export type ApplicantLevel = 'director' | 'teamlead' | 'worker';

// 신청자(근로자) 이름(공백무시)+본인휴대(숫자만) → 'director'|'teamlead' 매칭 맵
export async function buildApplicantLevelMap(): Promise<Record<string, 'director' | 'teamlead'>> {
  const { rows } = await pool.query(
    `SELECT device_name, personal_phone, roles FROM admin_devices
      WHERE device_name IS NOT NULL AND device_name<>'' AND personal_phone IS NOT NULL AND personal_phone<>''
        AND roles && ARRAY['director','teamlead']::text[]`
  );
  const map: Record<string, 'director' | 'teamlead'> = {};
  for (const m of rows) {
    const roles: string[] = m.roles || [];
    const key = `${norm(m.device_name)}|${digits(m.personal_phone)}`;
    const lvl = roles.includes('director') ? 'director' : 'teamlead';
    if (map[key] !== 'director') map[key] = lvl; // director 우선
  }
  return map;
}

// 신청자 레벨 판정(매칭 없으면 worker). worker는 {name|worker_name, phone} 형태.
export function levelOf(map: Record<string, 'director' | 'teamlead'>, worker: any): ApplicantLevel {
  return map[`${norm(worker.worker_name ?? worker.name)}|${digits(worker.phone)}`] || 'worker';
}

// 이 승인자 프로필이 해당 신청(신청자 레벨+소속)을 승인할 수 있는가.
//  teams/divs 는 '전체' 제거된 구체 범위(미들웨어 req.adminDevice.scopeTeams 와 동일 규격).
export function canApproveFor(
  profile: { isAuthority?: boolean; roles: string[]; teams: string[]; divs: string[] },
  lvl: ApplicantLevel, worker: { team?: string | null; division?: string | null }
): boolean {
  if (profile.isAuthority) return true;
  if (lvl === 'worker') return profile.roles.includes('teamlead') && !!worker.team && profile.teams.includes(worker.team);
  if (lvl === 'teamlead') return profile.roles.includes('director') && !!worker.division && profile.divs.includes(worker.division);
  return false; // director 신청은 자동승인(승인 대상 아님)
}

// 한 사용자(근로자 계정)의 승인자 프로필: 이름+본인휴대로 매칭된 admin_device(director/teamlead)들을 집계.
//  teams 는 '전체' 제거. 매칭이 없으면 isApprover=false.
export async function getApproverProfileByUser(userId: string): Promise<{
  isApprover: boolean; roles: string[]; teams: string[]; divs: string[];
}> {
  const { rows: u } = await pool.query('SELECT name, phone FROM users WHERE id=$1', [userId]);
  if (!u[0]) return { isApprover: false, roles: [], teams: [], divs: [] };
  const name = norm(u[0].name), ph = digits(u[0].phone);
  if (!ph) return { isApprover: false, roles: [], teams: [], divs: [] };
  const { rows } = await pool.query(
    `SELECT roles, scope_teams, scope_divisions FROM admin_devices
      WHERE replace(device_name,' ','')=$1
        AND regexp_replace(COALESCE(personal_phone,''),'\\D','','g')=$2
        AND roles && ARRAY['director','teamlead']::text[]`,
    [name, ph]
  );
  const roles = new Set<string>(), teams = new Set<string>(), divs = new Set<string>();
  for (const r of rows) {
    const rr: string[] = r.roles || [];
    if (rr.includes('teamlead')) { roles.add('teamlead'); for (const t of (r.scope_teams || [])) if (t && t !== '전체') teams.add(t); }
    if (rr.includes('director')) { roles.add('director'); for (const d of (r.scope_divisions || [])) if (d) divs.add(d); }
  }
  return { isApprover: roles.size > 0, roles: [...roles], teams: [...teams], divs: [...divs] };
}

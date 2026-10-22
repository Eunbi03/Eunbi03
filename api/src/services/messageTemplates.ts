import { pool } from '../db/pool';

// 발송 메시지 템플릿: DB(message_templates)에서 제목·본문을 읽어 {치환자}를 실제 값으로 바꾼다.
// DB가 없거나 비어 있으면 아래 코드 기본값으로 폴백하여 발송이 끊기지 않게 한다.
export interface Template { subject: string; body: string }

const DEFAULTS: Record<string, Template> = {
  monthly_report: {
    subject: '[{month}월 근태관리 리포트 안내]',
    body:
      '안녕하세요, {name}님.\n{corp} 인적자원팀입니다.\n\n{month}월 근태관리 리포트를 보내드립니다.\n' +
      '{reprimand}근태 현황에 대한 자세한 내용은 TimeCard 개인 애플리케이션에서 확인하실 수 있습니다.\n' +
      '문의사항이 있으시면 아래 연락처로 문의해 주시기 바랍니다.\n리포트: {link}\n\n감사합니다.\n{managers}',
  },
  device_invite: {
    subject: 'TimeCard 관리자 기기 등록 안내',
    body:
      '{name}님, 아래 링크를 등록하려는 기기(휴대폰/PC)에서 열면 해당 기기가 관리자 기기로 등록됩니다.\n\n' +
      '{link}\n\n링크는 7일간 유효합니다.',
  },
  random_check_push: { subject: 'TimeCard', body: '위치 권한을 확인해 주세요.' },
};

let cache: Record<string, Template> = {};
let cacheAt = 0;
const TTL_MS = 30 * 1000;

async function loadAll(): Promise<void> {
  try {
    const { rows } = await pool.query('SELECT key, subject, body FROM message_templates');
    const next: Record<string, Template> = {};
    for (const r of rows) next[r.key] = { subject: r.subject ?? '', body: r.body ?? '' };
    cache = next; cacheAt = Date.now();
  } catch {
    // 테이블 없음 등 → 기본값 사용
    cache = {}; cacheAt = Date.now();
  }
}

function subst(s: string, vars: Record<string, string>): string {
  return (s || '').replace(/\{(\w+)\}/g, (_m, k) => (vars[k] !== undefined ? vars[k] : ''));
}

// 템플릿을 가져와 치환한 { subject, body } 반환.
export async function renderTemplate(key: string, vars: Record<string, string> = {}): Promise<Template> {
  if (Date.now() - cacheAt > TTL_MS) await loadAll();
  const t = cache[key] || DEFAULTS[key] || { subject: '', body: '' };
  return { subject: subst(t.subject, vars), body: subst(t.body, vars) };
}

export function invalidateTemplateCache(): void { cacheAt = 0; }

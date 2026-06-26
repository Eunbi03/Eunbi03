import { pool } from '../db/pool';

// 메모리 캐시 — 서버 시작 시 및 CRUD 후 갱신
let _cache: Set<string> = new Set();
let _loaded = false;

export async function loadHolidayCache(): Promise<void> {
  const { rows } = await pool.query(`SELECT date::text AS date FROM public_holidays`);
  _cache = new Set(rows.map((r: any) => r.date));
  _loaded = true;
}

export function refreshHolidayCache(dates: string[]): void {
  _cache = new Set(dates);
  _loaded = true;
}

export function isHoliday(dateStr: string): boolean {
  return _cache.has(dateStr);
}

export function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return day === 0 || day === 6;
}

export function isWorkday(dateStr: string): boolean {
  return !isWeekend(dateStr) && !isHoliday(dateStr);
}

// 두 날짜 사이의 근무일 목록 반환 (inclusive)
export function workdaysBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const d = new Date(from + 'T00:00:00+09:00');
  const end = new Date(to + 'T00:00:00+09:00');
  while (d <= end) {
    const s = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    if (isWorkday(s)) result.push(s);
    d.setDate(d.getDate() + 1);
  }
  return result;
}

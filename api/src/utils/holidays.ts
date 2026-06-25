// 대한민국 법정 공휴일 (매년 갱신 필요)
const HOLIDAYS = new Set([
  // 2025
  '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
  '2025-03-01','2025-05-05','2025-06-06','2025-08-15',
  '2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09',
  '2025-12-25',
  // 2026
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18',
  '2026-03-01','2026-03-02', // 대체공휴일
  '2026-05-05','2026-06-06','2026-08-15',
  '2026-09-24','2026-09-25','2026-09-26',
  '2026-10-03','2026-10-09','2026-12-25',
]);

export function isHoliday(dateStr: string): boolean {
  return HOLIDAYS.has(dateStr);
}

export function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T00:00:00+09:00').getDay();
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

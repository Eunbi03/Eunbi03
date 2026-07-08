import { pool } from '../db/pool';
import { workdaysBetween, isHoliday } from '../utils/holidays';
import { classifyDay, leaveCountsAsCheckIn } from '../utils/attendanceKpi';

const hhmm = (t: any) => (t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 5) : null);
const dowOf = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay(); };

export interface ReportDay {
  date: string; dow: number; isWeekend: boolean; isHol: boolean;
  leaveType?: string | null; missing?: boolean; late?: boolean; noOut?: boolean; noNote?: boolean;
  checkIn?: { time: string | null; place: string } | null;
  checkOut?: { time: string | null; place: string } | null;
  outings: { time: string | null; place: string }[];
}

export interface BuiltReport {
  user: { id: string; name: string; corp: string; division: string; team: string; email: string | null; phone: string | null; workplaceName: string | null };
  from: string; to: string;
  kpi: { lateCount: number; missingIn: number; missingOut: number; missingNote: number; score: number };
  over: boolean;
  days: ReportDay[];
  noteMissDates: string[];
}

// 개별 리포트 데이터를 [from, to] 전 기간(달력용) 기준으로 산출한다.
export async function buildIndividualReport(userId: string, from: string, to: string): Promise<BuiltReport | null> {
  const { rows: userRows } = await pool.query(
    `SELECT u.id, u.name, u.corp, u.division, u.team, u.email, u.phone, w.name AS wp_name
     FROM users u LEFT JOIN workplaces w ON u.workplace_id=w.id WHERE u.id=$1`, [userId]
  );
  if (!userRows[0]) return null;
  const u = userRows[0];
  const workplaceName: string | null = u.wp_name || null;

  const { rows: records } = await pool.query(
    `SELECT id, date::text AS date, check_in_time, check_out_time, check_out_is_field, status, leave_type,
            work_note_in, work_note_out, work_note_today, daily_report
     FROM attendance_records WHERE user_id=$1 AND date>=$2 AND date<=$3 ORDER BY date`,
    [userId, from, to]
  );
  const recIds = records.map((r: any) => r.id);
  const { rows: outings } = recIds.length
    ? await pool.query(`SELECT attendance_record_id, start_time, destination FROM outing_records WHERE attendance_record_id=ANY($1) ORDER BY start_time`, [recIds])
    : { rows: [] as any[] };

  const recByDate: Record<string, any> = {};
  for (const r of records) recByDate[r.date] = r;
  const outByRec: Record<string, any[]> = {};
  for (const o of outings) (outByRec[o.attendance_record_id] ||= []).push(o);

  const workdaySet = new Set(workdaysBetween(from, to));

  let lateCount = 0, missingIn = 0, missingOut = 0, missingNote = 0;
  const days: ReportDay[] = [];
  const noteMissDates: string[] = [];

  // from~to 전체 날짜 순회 (달력 표시용)
  const cur = new Date(from + 'T00:00:00+09:00');
  const end = new Date(to + 'T00:00:00+09:00');
  while (cur <= end) {
    const date = cur.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    cur.setDate(cur.getDate() + 1);
    const dow = dowOf(date);
    const isWeekend = dow === 0 || dow === 6;
    const isHol = isHoliday(date);
    const r = recByDate[date];
    const isWorkday = workdaySet.has(date);
    const k = classifyDay(r);
    const lt = r?.leave_type ?? null;

    const day: ReportDay = { date, dow, isWeekend, isHol, outings: [] };

    if (k.isLeave) { day.leaveType = '연차'; days.push(day); continue; }

    if (!k.present) {
      if (isWorkday) {
        missingIn++; day.missing = true;
        if (k.missingNote) { missingNote++; noteMissDates.push(date); }
      }
      days.push(day);
      continue;
    }

    if (isWorkday || Boolean(r.check_in_time)) {
      if (k.isLate) lateCount++;
      if (k.missingOut) missingOut++;
      if (k.missingNote) { missingNote++; noteMissDates.push(date); }
    } else if (k.missingNote) {
      noteMissDates.push(date);
    }

    day.leaveType = lt || undefined;
    day.late = k.isLate;
    day.noOut = k.missingOut;
    day.noNote = k.missingNote;
    day.checkIn = r.check_in_time
      ? { time: hhmm(r.check_in_time), place: (r.work_note_in && r.work_note_in.trim()) || workplaceName || '' }
      : null;
    day.checkOut = r.check_out_time
      ? { time: hhmm(r.check_out_time), place: (r.work_note_out && r.work_note_out.trim()) || workplaceName || '' }
      : (k.missingOut ? null : undefined);
    const outs = outByRec[r.id] || [];
    day.outings = outs.slice(0, 2).map((o: any) => ({ time: hhmm(o.start_time), place: o.destination || '' }));
    days.push(day);
  }

  const score = lateCount + missingIn + missingOut + missingNote;
  return {
    user: { id: u.id, name: u.name, corp: u.corp || '', division: u.division || '', team: u.team || '', email: u.email, phone: u.phone, workplaceName },
    from, to,
    kpi: { lateCount, missingIn, missingOut, missingNote, score },
    over: score >= 5,
    days, noteMissDates,
  };
}

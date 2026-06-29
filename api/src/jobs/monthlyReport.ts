import cron from 'node-cron';
import { pool } from '../db/pool';
import { sendReportEmail } from '../services/reportSender';

const VIOLATION_THRESHOLD = parseInt(process.env.MONTHLY_VIOLATION_THRESHOLD || '5', 10);

function nextBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function isFirstBusinessDayOfMonth(): boolean {
  const today = new Date();
  const firstBizDay = nextBusinessDay(new Date(today.getFullYear(), today.getMonth(), 1));
  return today.toDateString() === firstBizDay.toDateString();
}

async function runMonthlyReportBatch() {
  const today = new Date();
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearMonth = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, '0')}`;

  const { rows: users } = await pool.query(
    "SELECT id, name, email, corp, team FROM users WHERE role='worker' AND is_active=TRUE"
  );
  console.log(`[월간리포트] ${yearMonth} 대상 ${users.length}명`);

  for (const user of users) {
    const { rows } = await pool.query(
      `SELECT
         count(*) FILTER (WHERE status IN ('지각','지각조퇴')) AS late_count,
         count(*) FILTER (WHERE status IN ('조퇴','지각조퇴')) AS early_leave_count,
         count(*) FILTER (WHERE status = '결근') AS missing_clock_count,
         count(*) FILTER (WHERE check_out_time IS NOT NULL AND daily_report IS NULL AND work_note_today IS NULL) AS missing_report_count
       FROM attendance_records WHERE user_id=$1 AND date>=$2 AND date<$3`,
      [user.id, prevMonthStart.toISOString().slice(0, 10), thisMonthStart.toISOString().slice(0, 10)]
    );
    const agg = rows[0];
    const late = parseInt(agg.late_count, 10);
    const earlyLeave = parseInt(agg.early_leave_count, 10);
    const missingClock = parseInt(agg.missing_clock_count, 10);
    const missingReport = parseInt(agg.missing_report_count, 10);
    const total = missingClock + missingReport + late;
    const reprimand = total >= VIOLATION_THRESHOLD;

    await pool.query(
      `INSERT INTO monthly_reports (user_id, year_month, late_count, early_leave_count, missing_clock_count, missing_report_count, total_violations, reprimand_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, year_month) DO UPDATE SET
         late_count=EXCLUDED.late_count, early_leave_count=EXCLUDED.early_leave_count,
         missing_clock_count=EXCLUDED.missing_clock_count, missing_report_count=EXCLUDED.missing_report_count,
         total_violations=EXCLUDED.total_violations, reprimand_required=EXCLUDED.reprimand_required`,
      [user.id, yearMonth, late, earlyLeave, missingClock, missingReport, total, reprimand]
    );

    try {
      await sendReportEmail({ to: user.email, name: user.name, yearMonth, lateCount: late, earlyLeaveCount: earlyLeave, missingClockCount: missingClock, missingReportCount: missingReport, totalViolations: total, reprimandRequired: reprimand });
      await pool.query("UPDATE monthly_reports SET sent_at=now(), sent_via='email' WHERE user_id=$1 AND year_month=$2", [user.id, yearMonth]);
    } catch (err: any) {
      console.error(`[리포트 발송 실패] ${user.email}:`, err.message);
      await pool.query('UPDATE monthly_reports SET send_failed=TRUE WHERE user_id=$1 AND year_month=$2', [user.id, yearMonth]);
    }
  }
  console.log(`[월간리포트] ${yearMonth} 완료`);
}

export function startMonthlyReportScheduler() {
  cron.schedule('0 9 * * *', async () => {
    if (isFirstBusinessDayOfMonth()) await runMonthlyReportBatch();
  }, { timezone: 'Asia/Seoul' });
  console.log('[월간리포트] 스케줄러 등록 완료');
}

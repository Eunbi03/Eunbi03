import cron from 'node-cron';
import { pool } from '../db/pool';
import { generateRandomMinuteOffsets, offsetsToDateTimes } from '../utils/randomTimeSlots';
import { notifyUser } from '../services/notificationService';

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false }).slice(0, 5);
}

async function generateDailyRandomCheckSlots() {
  const { rows: users } = await pool.query(
    "SELECT id, scheduled_start, scheduled_end, lunch_start, lunch_end FROM users WHERE role='worker' AND is_active=TRUE"
  );
  const date = todayKST();
  let total = 0;
  for (const user of users) {
    try {
      const offsets = generateRandomMinuteOffsets({
        workStart: user.scheduled_start.slice(0, 5),
        workEnd: user.scheduled_end.slice(0, 5),
        lunchStart: user.lunch_start.slice(0, 5),
        lunchEnd: user.lunch_end.slice(0, 5),
        slotCount: 3,
      });
      for (const t of offsetsToDateTimes(date, offsets)) {
        await pool.query(
          'INSERT INTO random_location_checks (user_id, date, scheduled_time) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [user.id, date, t]
        );
        total++;
      }
    } catch (err: any) {
      console.error(`[랜덤체크 생성 실패] user=${user.id}:`, err.message);
    }
  }
  console.log(`[랜덤체크] ${date} - ${users.length}명, 총 ${total}개 슬롯 생성`);
}

async function dispatchRandomCheckNotifications() {
  const { rows } = await pool.query(
    "SELECT id, user_id FROM random_location_checks WHERE notification_sent=FALSE AND scheduled_time<=now() AND scheduled_time>now()-interval '5 minutes'"
  );
  for (const check of rows) {
    await notifyUser(check.user_id, {
      title: '위치 확인 요청', body: '지금 위치 정보를 전송해주세요.',
      data: { type: 'random_check', checkId: check.id },
    });
    await pool.query('UPDATE random_location_checks SET notification_sent=TRUE WHERE id=$1', [check.id]);
  }
}

async function dispatchPreShiftReminders() {
  const now = nowHHMM();
  const { rows: checkInSoon } = await pool.query(
    "SELECT id FROM users WHERE role='worker' AND is_active=TRUE AND to_char(scheduled_start - interval '5 minutes','HH24:MI')=$1", [now]
  );
  for (const u of checkInSoon) {
    await notifyUser(u.id, { title: '출근 알림', body: '출근 시간 5분 전입니다.', data: { type: 'pre_checkin' } });
  }

  const { rows: checkOutSoon } = await pool.query(
    "SELECT id FROM users WHERE role='worker' AND is_active=TRUE AND to_char(scheduled_end - interval '5 minutes','HH24:MI')=$1", [now]
  );
  for (const u of checkOutSoon) {
    await notifyUser(u.id, { title: '퇴근 알림', body: '퇴근 시간 5분 전입니다.', data: { type: 'pre_checkout' } });
  }
}

async function finalizeAbsentees() {
  const date = todayKST();
  const { rows: users } = await pool.query("SELECT id FROM users WHERE role='worker' AND is_active=TRUE");
  for (const u of users) {
    const { rows } = await pool.query('SELECT id FROM attendance_records WHERE user_id=$1 AND date=$2', [u.id, date]);
    if (rows.length === 0) {
      await pool.query("INSERT INTO attendance_records (user_id, date, status) VALUES ($1,$2,'결근')", [u.id, date]);
    }
  }
  console.log(`[결근 마감] ${date} 완료`);
}

export function startScheduler() {
  cron.schedule('0 5 * * *', generateDailyRandomCheckSlots, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', dispatchRandomCheckNotifications, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', dispatchPreShiftReminders, { timezone: 'Asia/Seoul' });
  cron.schedule('55 23 * * *', finalizeAbsentees, { timezone: 'Asia/Seoul' });
  console.log('[스케줄러] 모든 정기 작업 등록 완료');
}

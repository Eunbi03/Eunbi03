import cron from 'node-cron';
import { pool } from '../db/pool';
import { generateRandomMinuteOffsets, offsetsToDateTimes } from '../utils/randomTimeSlots';

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
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

// 시각이 도래한 랜덤 확인 슬롯을 "활성화"한다(notification_sent=TRUE).
// 푸시 알림은 사용하지 않으며, 근로자 앱이 폴링으로 활성 슬롯을 감지해 자동으로 위치를 수집한다.
// 출근 후 2시간 이내 슬롯은 skipped=TRUE로 표시해 "미응답"이 아닌 "제외"로 처리한다.
// (5분 창 제한을 두지 않으므로 API가 잠시 멈춰도 누락되지 않는다.)
async function activateDueRandomChecks() {
  const { rows } = await pool.query(
    `SELECT rc.id, rc.scheduled_time, ar.check_in_time
     FROM random_location_checks rc
     LEFT JOIN attendance_records ar ON ar.user_id = rc.user_id AND ar.date = rc.date
     WHERE rc.notification_sent=FALSE AND rc.scheduled_time <= now()`
  );
  for (const check of rows) {
    let skipped = false;
    if (check.check_in_time) {
      const diff = new Date(check.scheduled_time).getTime() - new Date(check.check_in_time).getTime();
      if (diff < 2 * 60 * 60 * 1000) skipped = true; // 출근 직후 2시간 이내 → 제외
    }
    await pool.query(
      'UPDATE random_location_checks SET notification_sent=TRUE, skipped=$2 WHERE id=$1',
      [check.id, skipped]
    );
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
  cron.schedule('* * * * *', activateDueRandomChecks, { timezone: 'Asia/Seoul' });
  cron.schedule('55 23 * * *', finalizeAbsentees, { timezone: 'Asia/Seoul' });
  console.log('[스케줄러] 모든 정기 작업 등록 완료');
}

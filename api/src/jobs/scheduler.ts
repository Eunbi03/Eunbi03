import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { generateRandomMinuteOffsets, offsetsToDateTimes } from '../utils/randomTimeSlots';
import { sendDataPush, fcmEnabled } from '../services/fcm';
import { isWorkday } from '../utils/holidays';

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
      total += await generateRandomCheckSlotsForUser(user, date);
    } catch (err: any) {
      console.error(`[랜덤체크 생성 실패] user=${user.id}:`, err.message);
    }
  }
  console.log(`[랜덤체크] ${date} - ${users.length}명, 총 ${total}개 슬롯 생성`);
}

// 한 직원의 특정 날짜 랜덤 확인 슬롯 3개를 생성한다.
// onlyFuture=true 면 이미 지난 시각의 슬롯은 건너뛴다(당일 신규 등록 시 사용 — 과거 슬롯이 곧장 미응답 처리되는 걸 방지).
export async function generateRandomCheckSlotsForUser(
  user: { id: string; scheduled_start: string; scheduled_end: string; lunch_start: string; lunch_end: string },
  date: string,
  onlyFuture = false,
): Promise<number> {
  // 값이 없을 수 있으므로 기본값으로 방어 (미설정 근로자도 생성 실패하지 않게)
  const offsets = generateRandomMinuteOffsets({
    workStart: (user.scheduled_start || '09:00').slice(0, 5),
    workEnd: (user.scheduled_end || '18:00').slice(0, 5),
    lunchStart: (user.lunch_start || '12:00').slice(0, 5),
    lunchEnd: (user.lunch_end || '13:00').slice(0, 5),
    slotCount: 3,
  });
  let count = 0;
  for (const t of offsetsToDateTimes(date, offsets)) {
    if (onlyFuture && t.getTime() <= Date.now()) continue;
    await pool.query(
      'INSERT INTO random_location_checks (user_id, date, scheduled_time) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [user.id, date, t]
    );
    count++;
  }
  return count;
}

// 시각이 도래한 랜덤 확인 슬롯을 "활성화"한다(notification_sent=TRUE).
// 푸시 알림은 사용하지 않으며, 근로자 앱이 폴링으로 활성 슬롯을 감지해 자동으로 위치를 수집한다.
// (5분 창 제한을 두지 않으므로 API가 잠시 멈춰도 누락되지 않는다.)
// 출근이 늦어져 슬롯 시각과 가까워도 제외하지 않고 그대로 위치를 수집한다.
// 각 슬롯이 도래하면 근로자 기기로 무음 푸시를 보내 백그라운드에서 위치를 수집하게 한다.
async function activateDueRandomChecks() {
  const { rows } = await pool.query(
    `SELECT rc.id, rc.user_id, u.fcm_token
     FROM random_location_checks rc JOIN users u ON u.id = rc.user_id
     WHERE rc.notification_sent=FALSE AND rc.scheduled_time <= now()`
  );
  for (const r of rows) {
    await pool.query('UPDATE random_location_checks SET notification_sent=TRUE WHERE id=$1', [r.id]);
    if (r.fcm_token) {
      // 이 슬롯의 위치 제출만 허용하는 단기 토큰을 푸시에 담아 보낸다.
      const t = jwt.sign(
        { checkId: r.id, uid: r.user_id, purpose: 'rc' },
        process.env.JWT_SECRET as string,
        { expiresIn: '15m' }
      );
      await sendDataPush(r.fcm_token, { type: 'random_check', checkId: String(r.id), t });
    }
  }
}

async function finalizeAbsentees() {
  const date = todayKST();
  // 주말·공휴일에는 결근으로 처리하지 않는다.
  if (!isWorkday(date)) {
    console.log(`[결근 마감] ${date} — 근무일 아님(주말/공휴일), 건너뜀`);
    return;
  }
  // 정기 근무자만 대상. 비정기 근무자는 근무일이 특정되지 않으므로 결근 처리에서 제외한다.
  const { rows: users } = await pool.query(
    "SELECT id FROM users WHERE role='worker' AND is_active=TRUE AND COALESCE(irregular_worker, FALSE)=FALSE"
  );
  for (const u of users) {
    const { rows } = await pool.query('SELECT id FROM attendance_records WHERE user_id=$1 AND date=$2', [u.id, date]);
    if (rows.length === 0) {
      await pool.query("INSERT INTO attendance_records (user_id, date, status) VALUES ($1,$2,'결근')", [u.id, date]);
    }
  }
  console.log(`[결근 마감] ${date} 완료 (정기 근무자 ${users.length}명 대상)`);
}

export function startScheduler() {
  // 시작 시 FCM 초기화 상태를 즉시 로그로 남긴다.
  console.log(`[FCM] 푸시 사용 가능: ${fcmEnabled() ? '예' : '아니오(키 파일 확인 필요)'}`);
  cron.schedule('0 5 * * *', generateDailyRandomCheckSlots, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', activateDueRandomChecks, { timezone: 'Asia/Seoul' });
  cron.schedule('55 23 * * *', finalizeAbsentees, { timezone: 'Asia/Seoul' });
  console.log('[스케줄러] 모든 정기 작업 등록 완료');
}

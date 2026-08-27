import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { generateRandomMinuteOffsets, offsetsToDateTimes } from '../utils/randomTimeSlots';
import { sendDataPush, sendNotification, fcmEnabled } from '../services/fcm';
import { isWorkday, loadHolidayCache } from '../utils/holidays';

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

async function generateDailyRandomCheckSlots() {
  const date = todayKST();
  // 공휴일 판정이 최신이 되도록 캐시를 다시 로드(부팅 시 실패로 비어있는 경우 방지)
  try { await loadHolidayCache(); } catch (e: any) { console.error('[랜덤체크] 공휴일 캐시 로드 실패, 생성 건너뜀:', e.message); return; }
  // 주말·공휴일에는 아예 생성하지 않는다.
  if (!isWorkday(date)) { console.log(`[랜덤체크] ${date} 근무일 아님 — 생성 건너뜀`); return; }
  const { rows: users } = await pool.query(
    "SELECT id, scheduled_start, scheduled_end, lunch_start, lunch_end FROM users WHERE role='worker' AND is_active=TRUE AND COALESCE(irregular_worker, FALSE)=FALSE"
  );
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
  force = false,
): Promise<number> {
  // 주말·공휴일 등 근무일이 아니면 랜덤 확인 슬롯을 만들지 않는다.
  // (force=true면 근무일 여부와 무관하게 생성 — 비근무일 실제 출근, 비정기 근무자 출근 대응)
  if (!force && !isWorkday(date)) return 0;
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
  // 공휴일 판정 캐시를 다시 로드. 실패하면 결근 오처리를 막기 위해 마감을 건너뛴다(fail-safe).
  try { await loadHolidayCache(); } catch (e: any) { console.error('[결근 마감] 공휴일 캐시 로드 실패, 마감 건너뜀:', e.message); return; }
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

// 현재 KST 기준 자정으로부터의 분(0~1439)
function nowMinutesKST(): number {
  const hm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}
function hhmmToMin(hhmm: string): number {
  const [h, m] = String(hhmm || '').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// 출근-5분 / 퇴근-5분 / 노트(퇴근시각) 리마인더를 서버가 직접 푸시로 보낸다.
// - 매분 실행. 각 근로자의 상태(출근/퇴근/노트/연차)를 DB로 판단해 필요한 사람에게만 발송.
// - 하루 한 번만(daily_reminders_sent 로 중복 방지). 서버 지연 대비 15분 창 안이면 발송.
async function sendDailyReminders() {
  if (!fcmEnabled()) return;
  const date = todayKST();
  try { await loadHolidayCache(); } catch { /* 캐시 유지 */ }
  const workday = isWorkday(date);
  const nowMin = nowMinutesKST();
  const WINDOW = 15; // 목표 시각 이후 15분 이내면 발송(지연·재시작 대비)

  // 정기 근무자 + 오늘 근태/노트 상태
  const { rows } = await pool.query(
    `SELECT u.id, u.scheduled_start, u.scheduled_end, u.fcm_token,
            ar.check_in_time, ar.check_out_time, ar.leave_type,
            COALESCE(ar.work_note_today, ar.daily_report) AS note
     FROM users u
     LEFT JOIN attendance_records ar ON ar.user_id=u.id AND ar.date=$1
     WHERE u.role='worker' AND u.is_active=TRUE AND COALESCE(u.irregular_worker,FALSE)=FALSE
       AND u.fcm_token IS NOT NULL`,
    [date]
  );

  for (const r of rows) {
    if (r.leave_type === '연차') continue; // 연차일은 알림 없음
    const startMin = hhmmToMin(r.scheduled_start || '09:00');
    const endMin = hhmmToMin(r.scheduled_end || '18:00');
    const hasIn = !!r.check_in_time;
    const hasOut = !!r.check_out_time;
    const hasNote = !!(r.note && String(r.note).trim());

    const due: Array<{ type: string; title: string; body: string }> = [];
    // 출근 5분 전 — 근무일이고 아직 출근 안 함
    if (workday && !hasIn && nowMin >= startMin - 5 && nowMin < startMin - 5 + WINDOW)
      due.push({ type: 'checkIn', title: 'TimeCard', body: '출근 체크 잊지 마세요!' });
    // 퇴근 5분 전 — 출근했고 아직 퇴근 안 함
    if (hasIn && !hasOut && nowMin >= endMin - 5 && nowMin < endMin - 5 + WINDOW)
      due.push({ type: 'checkOut', title: 'TimeCard', body: '퇴근 체크 잊지 마세요!' });
    // 노트 미작성 — 출근했고 노트 없음, 퇴근시각부터
    if (hasIn && !hasNote && nowMin >= endMin && nowMin < endMin + WINDOW)
      due.push({ type: 'note', title: 'TimeCard', body: '근무노트가 아직 작성되지 않았어요!' });

    for (const d of due) {
      // 중복 방지: 오늘 이 타입을 이미 보냈으면 skip
      const ins = await pool.query(
        `INSERT INTO daily_reminders_sent (user_id, date, type) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, date, type) DO NOTHING RETURNING 1`,
        [r.id, date, d.type]
      );
      if (ins.rowCount === 0) continue; // 이미 보냄
      await sendNotification(r.fcm_token, d.title, d.body);
    }
  }
}

export function startScheduler() {
  // 시작 시 FCM 초기화 상태를 즉시 로그로 남긴다.
  console.log(`[FCM] 푸시 사용 가능: ${fcmEnabled() ? '예' : '아니오(키 파일 확인 필요)'}`);
  cron.schedule('0 5 * * *', generateDailyRandomCheckSlots, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', activateDueRandomChecks, { timezone: 'Asia/Seoul' });
  cron.schedule('55 23 * * *', finalizeAbsentees, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', sendDailyReminders, { timezone: 'Asia/Seoul' });
  console.log('[스케줄러] 모든 정기 작업 등록 완료');
}

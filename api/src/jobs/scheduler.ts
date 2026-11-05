import cron from 'node-cron';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { generateRandomMinuteOffsets, offsetsToDateTimes } from '../utils/randomTimeSlots';
import { sendDataPush, sendNotification, fcmEnabled } from '../services/fcm';
import { isWorkday, loadHolidayCache } from '../utils/holidays';
import { renderTemplate } from '../services/messageTemplates';

function todayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
function yesterdayKST(): string {
  const d = new Date(todayKST() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

// 랜덤 확인이 제때 수집되지 않은 경우, 근무 중인(출근했고 아직 퇴근하지 않은) 근로자에게
// "보이는 알림"을 슬롯 시각 +5분에 딱 1회 보내 앱을 열어 위치를 확인하도록 유도한다.
// - 무음 푸시/백그라운드 수집이 정상 동작해 이미 수집(submitted_time)되면 보내지 않는다.
// - 알림은 슬롯 시각 +5분부터 +10분(수집 마감) 이내에 1회만 보낸다.
// - 출근을 누르지 않은 경우(휴일 등)에는 보내지 않는다(attendance_records의 check_in_time 기준).
// 1년 지난 작업 기록(감사 로그) 자동 삭제
async function purgeOldAuditLogs() {
  try {
    const { rowCount } = await pool.query("DELETE FROM audit_logs WHERE created_at < now() - interval '1 year'");
    if (rowCount) console.log(`[감사로그] 1년 경과 ${rowCount}건 삭제`);
  } catch (e: any) { console.error('[감사로그 삭제 실패]', e.message); }
}

// 30일 지난 자율 메시지 첨부파일 자동 삭제 (용량 관리)
async function purgeOldAttachments() {
  try {
    const { rowCount } = await pool.query("DELETE FROM message_attachments WHERE created_at < now() - interval '30 days'");
    if (rowCount) console.log(`[첨부파일] 30일 경과 ${rowCount}건 삭제`);
  } catch (e: any) { console.error('[첨부파일 삭제 실패]', e.message); }
}

async function sendRandomCheckAlerts() {
  const { rows } = await pool.query(
    `SELECT rc.id, rc.user_id, u.fcm_token
     FROM random_location_checks rc
     JOIN users u ON u.id = rc.user_id
     JOIN attendance_records ar ON ar.user_id = rc.user_id AND ar.date = rc.date
     WHERE rc.submitted_time IS NULL
       AND rc.skipped = FALSE
       AND rc.alert_count < 1
       AND u.fcm_token IS NOT NULL
       AND ar.check_in_time IS NOT NULL
       AND ar.check_out_time IS NULL
       AND now() >= rc.scheduled_time + interval '5 minutes'
       AND now() <= rc.scheduled_time + interval '10 minutes'`
  );
  const tpl = rows.length ? await renderTemplate('random_check_push') : { subject: 'TimeCard', body: '위치 권한을 확인해 주세요.' };
  for (const r of rows) {
    const ok = await sendNotification(r.fcm_token, tpl.subject, tpl.body);
    if (ok) {
      await pool.query(
        'UPDATE random_location_checks SET alert_count = alert_count + 1, last_alert_at = now() WHERE id=$1',
        [r.id]
      );
    }
  }
}

// 연장근무 승인 마감(연장일 당일 '본래 근무 시작시간' 전) 초과 시 자동 반려
async function autoRejectOvertime() {
  try {
    // 마감 기준:
    //  - 원 신청(연장일 당일에 수정 안 됨): 연장일의 본래 근무 종료시간(정규 퇴근) 전까지
    //  - 연장일이 지나 수정된 건: 연장일 +2일(그날 끝)까지
    const { rowCount } = await pool.query(
      `UPDATE overtime_requests o
          SET status='rejected',
              reject_reason='승인 마감 초과로 자동 반려',
              decided_at=now(), updated_at=now()
         FROM users u
        WHERE o.user_id=u.id AND o.status='pending'
          AND now() > (
            CASE WHEN (o.updated_at AT TIME ZONE 'Asia/Seoul')::date > o.work_date
              THEN ((o.work_date + INTERVAL '2 day' + TIME '23:59:59') AT TIME ZONE 'Asia/Seoul')
              ELSE ((o.work_date + COALESCE(u.scheduled_end,'18:00'::time)) AT TIME ZONE 'Asia/Seoul')
            END
          )`
    );
    if (rowCount) console.log(`[연장근무] 마감 초과 ${rowCount}건 자동 반려`);
  } catch (e: any) { console.error('[연장근무 자동반려 실패]', e.message); }
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
  const min = h * 60 + m;
  return min >= 1440 ? 0 : min; // 일부 환경에서 자정이 24:00으로 나오는 경우 방어
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
  const y = yesterdayKST();
  try { await loadHolidayCache(); } catch { /* 캐시 유지 */ }
  const workday = isWorkday(date);
  const nowMin = nowMinutesKST();
  const WINDOW = 15; // 목표 시각 이후 15분 이내면 발송(지연·재시작 대비)
  const inWin = (t: number) => nowMin >= t && nowMin < t + WINDOW;

  // 전체 근무자(정기·비정기) + 오늘/어제 근태·노트 + 승인된 연장(오늘/어제)
  //  출근 알림은 근무일이 특정되는 정기 근무자만. 퇴근·노트 알림은 양쪽 동일 규칙이며,
  //  승인된 연장이 있으면 그날의 '퇴근시각'을 연장 종료시각으로 간주해 알림을 맞춘다.
  //  연장이 자정을 넘기면(종료≤시작) 연장종료는 '다음날 새벽'이므로 그날 저녁엔 안 보내고
  //  다음날 어제 연장 세션으로 처리한다.
  const { rows } = await pool.query(
    `SELECT u.id, u.scheduled_start, u.scheduled_end, u.fcm_token, u.note_exempt,
            COALESCE(u.irregular_worker,FALSE) AS irregular_worker,
            ar.check_in_time AS ci, ar.check_out_time AS co, ar.leave_type AS lt,
            COALESCE(ar.work_note_today, ar.daily_report) AS note,
            to_char(ot.start_time,'HH24:MI') AS ot_s, to_char(ot.end_time,'HH24:MI') AS ot_e,
            ary.check_in_time AS ci_y, ary.check_out_time AS co_y, ary.leave_type AS lt_y,
            COALESCE(ary.work_note_today, ary.daily_report) AS note_y,
            to_char(oty.start_time,'HH24:MI') AS oty_s, to_char(oty.end_time,'HH24:MI') AS oty_e
     FROM users u
     LEFT JOIN attendance_records ar  ON ar.user_id=u.id  AND ar.date=$1
     LEFT JOIN attendance_records ary ON ary.user_id=u.id AND ary.date=$2
     LEFT JOIN overtime_requests ot  ON ot.user_id=u.id  AND ot.work_date=$1 AND ot.status='approved'
     LEFT JOIN overtime_requests oty ON oty.user_id=u.id AND oty.work_date=$2 AND oty.status='approved'
     WHERE u.role='worker' AND u.is_active=TRUE
       AND u.fcm_token IS NOT NULL`,
    [date, y]
  );

  for (const r of rows) {
    const startMin = hhmmToMin(r.scheduled_start || '09:00');
    const schedEnd = hhmmToMin(r.scheduled_end || '18:00');
    const hasIn = !!r.ci;
    const hasOut = !!r.co;
    const hasNote = !!(r.note && String(r.note).trim());

    const due: Array<{ type: string; title: string; body: string }> = [];

    // (1) 출근 5분 전 — 근무일이고 아직 출근 안 함 (정기 근무자만, 연차 제외). 연장과 무관하게 평소대로.
    if (r.lt !== '연차' && workday && !r.irregular_worker && !hasIn && inWin(startMin - 5))
      due.push({ type: 'checkIn', title: 'TimeCard', body: '출근 체크 잊지 마세요!' });

    // (2) 오늘 세션의 퇴근·노트 — 출근했고 미퇴근. 승인 연장이 있으면 퇴근시각을 연장 종료로 간주.
    if (r.lt !== '연차' && hasIn && !hasOut) {
      let endMin = schedEnd;
      let sameDay = true;
      if (r.ot_s && r.ot_e) {
        const otS = hhmmToMin(r.ot_s), otE = hhmmToMin(r.ot_e);
        if (otE > otS) endMin = otE;   // 당일 연장 → 종료시각으로 알림 이동
        else sameDay = false;          // 자정 넘김 → 오늘 저녁엔 안 보냄(다음날 (3)에서 처리)
      }
      if (sameDay) {
        if (inWin(endMin - 5)) due.push({ type: 'checkOut', title: 'TimeCard', body: '퇴근 체크 잊지 마세요!' });
        if (!hasNote && !r.note_exempt && inWin(endMin)) due.push({ type: 'note', title: 'TimeCard', body: '근무노트가 아직 작성되지 않았어요!' });
      }
    }

    // (3) 어제 '자정 넘긴' 연장 세션의 퇴근·노트 — 오늘 새벽에 발송 (어제 출근·미퇴근).
    if (r.lt_y !== '연차' && r.oty_s && r.oty_e && !!r.ci_y && !r.co_y) {
      const otS = hhmmToMin(r.oty_s), otE = hhmmToMin(r.oty_e);
      if (otE <= otS) {                // 자정 넘김
        const endMin = otE;            // 오늘 새벽 시각(예: 00:30 → 30)
        const hasNoteY = !!(r.note_y && String(r.note_y).trim());
        if (endMin - 5 >= 0 && inWin(endMin - 5)) due.push({ type: 'checkOutPrev', title: 'TimeCard', body: '퇴근 체크 잊지 마세요!' });
        if (!hasNoteY && !r.note_exempt && inWin(endMin)) due.push({ type: 'notePrev', title: 'TimeCard', body: '근무노트가 아직 작성되지 않았어요!' });
      }
    }

    for (const d of due) {
      // 이미 보냈으면 skip
      const already = await pool.query(
        'SELECT 1 FROM daily_reminders_sent WHERE user_id=$1 AND date=$2 AND type=$3',
        [r.id, date, d.type]
      );
      if ((already.rowCount ?? 0) > 0) continue;
      // 전송에 성공했을 때만 발송 기록 → 실패 시 다음 분(창 내)에 재시도
      const ok = await sendNotification(r.fcm_token, d.title, d.body);
      if (ok) await pool.query(
        `INSERT INTO daily_reminders_sent (user_id, date, type) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, date, type) DO NOTHING`,
        [r.id, date, d.type]
      );
    }
  }
}

export function startScheduler() {
  // 시작 시 FCM 초기화 상태를 즉시 로그로 남긴다.
  console.log(`[FCM] 푸시 사용 가능: ${fcmEnabled() ? '예' : '아니오(키 파일 확인 필요)'}`);
  cron.schedule('0 5 * * *', generateDailyRandomCheckSlots, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', activateDueRandomChecks, { timezone: 'Asia/Seoul' });
  // 랜덤 위치 확인이 수집 안 됐을 때 보내던 '위치 확인' 알림은 사용하지 않음(요청으로 비활성화).
  // cron.schedule('* * * * *', sendRandomCheckAlerts, { timezone: 'Asia/Seoul' });
  cron.schedule('55 23 * * *', finalizeAbsentees, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', sendDailyReminders, { timezone: 'Asia/Seoul' });
  cron.schedule('* * * * *', autoRejectOvertime, { timezone: 'Asia/Seoul' }); // 연장근무 승인 마감 자동 반려
  cron.schedule('10 4 * * *', purgeOldAuditLogs, { timezone: 'Asia/Seoul' }); // 매일 04:10 1년 지난 작업기록 삭제
  cron.schedule('15 4 * * *', purgeOldAttachments, { timezone: 'Asia/Seoul' }); // 매일 04:15 30일 지난 첨부파일 삭제
  console.log('[스케줄러] 모든 정기 작업 등록 완료');
}

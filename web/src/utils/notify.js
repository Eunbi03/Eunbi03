// 로컬 알림(출퇴근 5분 전 / 근무노트 미작성) — Capacitor Local Notifications
// 앱이 닫혀 있어도 예약된 시각에 폰에서 울린다.
// 출퇴근 버튼을 이미 눌렀으면 해당 알림은 예약되지 않는다(상태 변화 시 재예약).
import { LocalNotifications } from "@capacitor/local-notifications";

const ID = { checkIn: 1001, checkOut: 1002, note: 1003 };

async function ensurePerm() {
  try {
    const s = await LocalNotifications.checkPermissions();
    if (s.display !== "granted") await LocalNotifications.requestPermissions();
  } catch { /* 웹 등에서 무시 */ }
}

// "HH:MM" + 오늘 날짜 → Date(로컬시간), offsetMin 분 이동
function todayAt(hhmm, offsetMin = 0) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m + offsetMin, 0, 0);
  return d;
}

async function cancelIds(ids) {
  try { await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }); } catch { /* 무시 */ }
}

// 오늘의 알림을 현재 상태에 맞게 (재)예약한다.
// - 비정기 근무자(isIrregular): 알림 없음
// - 출근 5분 전: 근무일(주말·공휴일 제외)이고 아직 출근 안 했을 때만
// - 퇴근 5분 전: 출근을 눌렀고 아직 퇴근 안 했을 때만
// - 근무노트 미작성: 출근을 눌렀고 노트가 없을 때, 퇴근 시각에
export async function scheduleDailyReminders({ startTime, endTime, checkedIn, checkedOut, noteWritten, isLeave, isIrregular, isWorkday }) {
  await ensurePerm();
  // 기존 예약 모두 취소 후, 조건에 맞는 것만 다시 예약
  await cancelIds([ID.checkIn, ID.checkOut, ID.note]);
  if (isIrregular || isLeave) return; // 비정기 근무자·연차일 → 알림 없음

  const now = Date.now();
  const list = [];

  // 출근 5분 전 — 근무일이고 아직 출근 안 했을 때만
  if (isWorkday && !checkedIn) {
    const at = todayAt(startTime, -5);
    if (at && at.getTime() > now) list.push({ id: ID.checkIn, title: "TimeCard", body: "출근 체크 잊지 마세요!", schedule: { at } });
  }
  // 퇴근 5분 전 — 출근을 눌렀고 아직 퇴근 안 했을 때만
  if (checkedIn && !checkedOut) {
    const at = todayAt(endTime, -5);
    if (at && at.getTime() > now) list.push({ id: ID.checkOut, title: "TimeCard", body: "퇴근 체크 잊지 마세요!", schedule: { at } });
  }
  // 근무노트 미작성 — 출근을 눌렀고 노트가 없을 때, 퇴근 시각에
  if (checkedIn && !noteWritten) {
    const at = todayAt(endTime, 0);
    if (at && at.getTime() > now) list.push({ id: ID.note, title: "TimeCard", body: "근무노트가 아직 작성되지 않았어요!", schedule: { at } });
  }

  if (list.length) {
    try { await LocalNotifications.schedule({ notifications: list }); } catch { /* 무시 */ }
  }
}

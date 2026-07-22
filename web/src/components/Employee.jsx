import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { fmtTime, fmtDur } from "../utils/format.js";
import { getLocation, startLocationWatch, stopLocationWatch, checkLocationPermission } from "../utils/device.js";
import { startIosBackgroundLocation, stopIosBackgroundLocation } from "../utils/iosLocation.js";
import MoveForm from "./MoveForm.jsx";
import OutForm from "./OutForm.jsx";
import Splash from "./Splash.jsx";
import { scheduleDailyReminders } from "../utils/notify.js";
import { registerPushToken } from "../utils/push.js";
import useRandomCheckPolling from "../hooks/useRandomCheckPolling.js";
import * as api from "../api/client.js";

// 근로자 화면 색상
const W = {
  bg: "#f4f6f7", card: "#ffffff", ink: "#333333", sub: "#787878",
  blue: "#2f6d8f", cellBlue: "#c9e6f4", border: "#c9e6f4",
  red: "#cb6156", redBg: "#fff0f0", amber: "#b9820f", amberBg: "#f6ebcf",
  green: "#3E7C5A", greenBg: "#DCEBE1", noteBorder: "#c2c2c2", cellBg: "#F4F6F7",
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function todayLabel() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // 2026-07-07
  const [, m, d] = ymd.split("-").map(Number);
  const dow = DOW[new Date(ymd + "T12:00:00Z").getUTCDay()];
  return `${m}/${d} (${dow})`;
}

// 오늘(KST) 기본 퇴근시간 + 2시간의 타임스탬프(ms) — GPS 자동 종료 시각
function endPlus2hMs(endHHMM) {
  const [h, m] = String(endHHMM || "18:00").split(":").map(Number);
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const dt = new Date(`${ymd}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`);
  return dt.getTime() + 2 * 60 * 60 * 1000;
}

function WarnIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ verticalAlign: "middle" }} aria-label="누락">
      <circle cx="12" cy="12" r="10" fill={W.red} />
      <rect x="10.7" y="6" width="2.6" height="8" rx="1.3" fill="#fff" />
      <circle cx="12" cy="17.2" r="1.5" fill="#fff" />
    </svg>
  );
}

function StatusBadge({ isCheckedIn, isCheckedOut, leaveType }) {
  const base = { fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 20, flexShrink: 0 };
  if (leaveType === "연차") return <span style={{ ...base, background: W.greenBg, color: W.green }}>연차</span>;
  if (isCheckedOut) return <span style={{ ...base, background: "#eceff1", color: W.sub }}>퇴근 완료</span>;
  if (isCheckedIn) return <span style={{ ...base, background: W.greenBg, color: W.green }}>근무 중</span>;
  return <span style={{ ...base, background: W.amberBg, color: W.amber }}>미출근</span>;
}

const cardStyle = { background: W.card, borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", marginBottom: 12 };
const ghostBtn = { width: "100%", background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, color: W.ink, cursor: "pointer" };

export default function Employee({ user }) {
  const [today, setToday] = useState(null);
  const [schedule, setSchedule] = useState({ start: "09:00", end: "18:00" });
  const [weekly, setWeekly] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [view, setView] = useState("main");
  const [showWeekly, setShowWeekly] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [gpsBanner, setGpsBanner] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);
  const [showCheckoutSplash, setShowCheckoutSplash] = useState(false);
  const [dayMeta, setDayMeta] = useState({ irregularWorker: false, isWorkday: true });

  const isCheckedIn = !!today?.checkIn?.time;
  const isCheckedOut = !!today?.checkOut?.time;
  const outings = today?.outings || [];
  const outingDests = [...new Set(outings.map((o) => o.destination).filter(Boolean))].join(", ");
  const activeOuting = isCheckedOut ? null : (outings.find((o) => !o.endTime) ?? null);
  const pastOutings = outings.filter((o) => o.endTime); // 종료된 외근 (일반 텍스트로 표기)

  // 출근을 근무지 반경 밖에서 눌렀고 30분 이내에 외근을 기록했다면,
  // 그 외근 목적지를 퇴근 시 '출근 장소' 기본값으로 제안한다. (외근지 출근 대응)
  const checkInPlaceSuggestion = (() => {
    const ci = today?.checkIn;
    if (!ci || ci.distanceM == null) return null;
    const radius = schedule.radiusM ?? 500;
    if (ci.distanceM <= radius) return null; // 반경 안에서 출근했으면 제안 없음
    const ciMs = new Date(ci.time).getTime();
    const match = outings.find((o) => {
      if (!o.destination) return false;
      const st = new Date(o.startTime).getTime();
      return st >= ciMs && st - ciMs <= 30 * 60 * 1000; // 출근 후 30분 이내 시작한 외근
    });
    return match?.destination || null;
  })();

  useRandomCheckPolling(isCheckedIn && !isCheckedOut, () => load(true));

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [t, w] = await Promise.all([api.getAttendanceToday(), api.getWeeklySummary()]);
      setToday(t.record || null);
      if (t.schedule) setSchedule(t.schedule);
      setDayMeta({ irregularWorker: !!t.irregularWorker, isWorkday: t.isWorkday !== false });
      setWeekly(w);
    } catch (e) { setErr(e.message); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => {
    load();
    checkLocationPermission().then((state) => { if (state !== "granted") setGpsBanner(true); });
    registerPushToken(); // 백그라운드 랜덤확인용 FCM 토큰 등록
  }, []);

  useEffect(() => {
    if (isCheckedIn && !isCheckedOut) {
      // 출근 중: GPS 감지 시작. 퇴근을 누르지 않아도 기본 퇴근시간+2시간에 자동 종료.
      startLocationWatch(endPlus2hMs(schedule.end));
      startIosBackgroundLocation(); // iOS 백그라운드 수집(안드로이드에서는 무시됨)
    } else if (isCheckedOut) {
      // 퇴근 버튼을 누르면 즉시 종료
      stopLocationWatch();
      stopIosBackgroundLocation();
    }
    // 로그아웃/화면 이탈 시에는 끄지 않는다 — 랜덤 확인을 위해 근무 세션 동안 유지
    // (퇴근 또는 기본 퇴근시간+2시간에 자동 종료됨)
  }, [isCheckedIn, isCheckedOut, schedule.end]);

  // 출퇴근/노트 알림을 현재 상태에 맞게 (재)예약 — 버튼 이미 눌렀으면 해당 알림은 예약 안 됨
  useEffect(() => {
    if (!schedule) return;
    scheduleDailyReminders({
      startTime: schedule.start,
      endTime: schedule.end,
      checkedIn: isCheckedIn,
      checkedOut: isCheckedOut,
      noteWritten: !!(today?.noteToday && today.noteToday.trim()),
      isLeave: today?.leaveType === "연차",
      isIrregular: dayMeta.irregularWorker,
      isWorkday: dayMeta.isWorkday,
    });
  }, [schedule, isCheckedIn, isCheckedOut, today?.noteToday, today?.leaveType, dayMeta.irregularWorker, dayMeta.isWorkday]);

  const checkIn = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const loc = await getLocation();
      if (!loc) { setErr("위치를 가져올 수 없습니다. GPS를 확인해주세요."); return; }
      await api.checkIn(loc);
      setGpsBanner(false);
      await load(true);
      setMsg("출근이 완료되었습니다!");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // 복귀 — 진행 중인 외근을 종료하고 기본 근무지 상태로 돌아온다.
  const returnToBase = async () => {
    if (!activeOuting) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.endOuting(activeOuting.id);
      await load(true);
      setMsg("복귀 처리되었습니다.");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const saveNote = async () => {
    if (!noteDraft.trim()) { setErr("오늘 업무 내용을 입력해주세요."); return; }
    setNoteBusy(true); setErr(""); setMsg("");
    try {
      await api.saveWorkNote({ workNoteToday: noteDraft });
      setNoteEditing(false);
      await load(true);
      setMsg("근무노트가 저장되었습니다.");
    } catch (e) { setErr(e.message); }
    finally { setNoteBusy(false); }
  };

  const loadMonthly = async () => {
    if (monthly) { setShowMonthly(!showMonthly); return; }
    try { const m = await api.getMonthlySummary(); setMonthly(m); setShowMonthly(true); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <div style={{ ...S.empty, background: W.bg }}>불러오는 중…</div>;

  // 퇴근 완료 후 3초 안내 화면 (터치 시 즉시 종료)
  if (showCheckoutSplash)
    return (
      <Splash
        slides={[{ src: "/checkout.gif", ms: 3500, title: "오늘 하루도 수고하셨습니다!" }]}
        onDone={() => setShowCheckoutSplash(false)}
      />
    );

  if (view === "outing") return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      <MoveForm onClose={() => setView("main")} onDone={() => { setView("main"); load(true); }} />
    </div>
  );
  if (view === "out") return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      <OutForm workplaceName={schedule.workplaceName} checkInPlace={checkInPlaceSuggestion} initialNote={today?.noteToday || ""} outings={outings} activeOuting={activeOuting} onClose={() => setView("main")} onDone={() => { setView("main"); load(true); setShowCheckoutSplash(true); }} />
    </div>
  );
  if (view === "history") return <HistoryView onBack={() => setView("main")} />;

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      {gpsBanner && !isCheckedIn && (
        <div style={{ background: W.amberBg, borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: W.amber, lineHeight: 1.6 }}>
          <strong>📍 위치 항상 허용 필요</strong><br />
          출근 버튼을 누르면 위치를 요청합니다. <strong>"항상 허용"</strong>을 선택해야 랜덤 위치 확인이 가능합니다.
        </div>
      )}
      {msg && <div style={{ ...S.busy, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ ...S.err, marginBottom: 12 }}>{err}</div>}

      {/* ── 오늘 근무 카드 ── */}
      <div style={{ ...cardStyle, padding: "18px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, color: W.sub, fontWeight: 600, marginBottom: 14 }}>오늘 근무</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: W.ink, lineHeight: 1.2 }}>{todayLabel()}</div>
            <div style={{ fontSize: 14, color: W.sub, marginTop: 2 }}>{schedule.start} ~ {schedule.end}</div>
          </div>
          <StatusBadge isCheckedIn={isCheckedIn} isCheckedOut={isCheckedOut} leaveType={today?.leaveType} />
        </div>

        {/* 출근 후: 출근시간 + 외근 이력 */}
        {isCheckedIn && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14, color: W.ink }}>출근</span>
              <span style={{ fontSize: 14, color: W.ink, fontVariantNumeric: "tabular-nums" }}>{fmtTime(today.checkIn.time)}</span>
            </div>
            {/* 종료된 외근 이력 (일반 텍스트) */}
            {pastOutings.map((o) => (
              <div key={o.id} style={{ fontSize: 14, color: W.ink, marginTop: 6, paddingLeft: 18 }}>
                외근 {fmtTime(o.startTime)}  {o.destination}
              </div>
            ))}
            {isCheckedOut && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                <span style={{ fontSize: 14, color: W.ink }}>퇴근</span>
                <span style={{ fontSize: 14, color: W.ink, fontVariantNumeric: "tabular-nums" }}>{fmtTime(today.checkOut.time)}</span>
              </div>
            )}
            {today.workMinutes != null && isCheckedOut && (
              <div style={{ marginTop: 8, fontSize: 16, color: W.ink }}>총 근로시간 <b style={{ color: W.green }}>{fmtDur(today.workMinutes)}</b></div>
            )}
          </div>
        )}

        {/* 외근 중 안내 박스 (항목15) */}
        {activeOuting && (
          <div style={{ marginTop: 12, padding: "7px 14px", background: W.amberBg, borderRadius: 10, fontSize: 13, fontWeight: 400, color: W.amber }}>
            <span style={{ fontWeight: 700 }}>외근 중</span>  {fmtTime(activeOuting.startTime)}  {activeOuting.destination}
          </div>
        )}

        {/* 연차 안내 */}
        {today?.leaveType === "연차" && !isCheckedIn && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: W.greenBg, borderRadius: 8, fontSize: 13, color: W.green, fontWeight: 700, textAlign: "center" }}>
            오늘은 연차 처리된 날입니다.
          </div>
        )}

        {/* 액션 버튼 */}
        {isCheckedOut ? (
          <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: W.sub }}>오늘 퇴근 완료. 수고하셨습니다! 🎉</div>
        ) : !isCheckedIn && today?.leaveType !== "연차" ? (
          <div style={{ marginTop: 20 }}>
            <button style={{ width: "100%", border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, background: W.ink, color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }} onClick={checkIn} disabled={busy}>
              {busy ? "처리 중…" : "출근하기"}
            </button>
          </div>
        ) : isCheckedIn ? (
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, color: W.ink, cursor: "pointer" }} onClick={() => setView("outing")}>외근</button>
            {activeOuting && (
              <button style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, color: W.ink, cursor: "pointer", opacity: busy ? 0.6 : 1 }} onClick={returnToBase} disabled={busy}>복귀</button>
            )}
            <button style={{ flex: activeOuting ? 1 : 2, border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, background: W.ink, color: "#fff", cursor: "pointer" }} onClick={() => setView("out")}>퇴근하기</button>
          </div>
        ) : null}
      </div>

      {/* ── 근무노트 작성 (출근 후) ── */}
      {isCheckedIn && today?.leaveType !== "연차" && (
        <div style={{ ...cardStyle, padding: "16px 18px" }}>
          {noteEditing ? (
            <>
              <textarea
                style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${W.noteBorder}`, borderRadius: 10, padding: 12, fontSize: 14, color: W.ink, minHeight: 120, resize: "vertical", background: "#fff" }}
                placeholder="오늘 진행한 업무를 입력해주세요"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={{ flex: 1, background: W.card, border: `1px solid ${W.border}`, borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 700, color: W.ink, cursor: "pointer" }} onClick={() => setNoteEditing(false)} disabled={noteBusy}>취소</button>
                <button style={{ flex: 1.6, border: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 800, background: W.ink, color: "#fff", cursor: "pointer", opacity: noteBusy ? 0.6 : 1 }} onClick={saveNote} disabled={noteBusy}>{noteBusy ? "저장 중…" : "저장"}</button>
              </div>
            </>
          ) : (
            <>
              <button style={ghostBtn} onClick={() => { setNoteDraft(today?.noteToday || outingDests); setNoteEditing(true); }}>근무노트 작성</button>
              {today?.noteToday && (
                <div style={{ fontSize: 15, color: W.ink, lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 12, paddingLeft: 4 }}>{today.noteToday}</div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 이번 주 근무 ── */}
      <div style={{ marginBottom: 12 }}>
        {showWeekly && weekly ? (
          <div style={{ ...cardStyle, border: `1px solid ${W.border}`, padding: "16px 16px 14px", marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: W.ink }}>이번 주 근무</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: W.sub, fontSize: 14 }} onClick={() => setShowWeekly(false)}>▲</button>
            </div>
            <WeeklyGrid days={buildWeek(weekly.days)} />
            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: W.ink, marginTop: 14 }}>
              총 {fmtDur(weekly.totalWorkMinutes || 0)} 근무
            </div>
          </div>
        ) : (
          <button style={{ ...ghostBtn, background: "#f4f6f7" }} onClick={() => setShowWeekly(true)}>이번 주 근무 보기 ▼</button>
        )}
      </div>

      {/* ── 이번 달 요약 ── */}
      <div style={{ marginBottom: 12 }}>
        {showMonthly && monthly ? (
          <div style={{ ...cardStyle, border: `1px solid ${W.border}`, padding: "16px 16px 14px", marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: W.ink }}>이번 달 요약</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: W.sub, fontSize: 14 }} onClick={() => setShowMonthly(false)}>▲</button>
            </div>
            <MonthlyGrid monthly={monthly} />
            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: W.ink, marginTop: 14 }}>
              총 {fmtDur(monthly.totalWorkMinutes || 0)} 근무
            </div>
          </div>
        ) : (
          <button style={{ ...ghostBtn, background: "#f4f6f7" }} onClick={loadMonthly}>이번 달 요약 보기 ▼</button>
        )}
      </div>

      {/* ── 근태 리포트 보기 ── */}
      <button style={{ ...ghostBtn, background: "#f4f6f7" }} onClick={() => setView("history")}>근태 리포트 보기</button>
    </div>
  );
}

// 이번 주(일~토) 7칸을 항상 보장 — 백엔드 응답을 날짜로 매핑, 없는 날은 합성
function buildWeek(serverDays) {
  const byDate = {};
  (serverDays || []).forEach((d) => { byDate[d.date] = d; });
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const [y, m, dd] = todayStr.split("-").map(Number);
  const todayDow = new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, dd - todayDow + i, 12));
    const ds = dt.toISOString().slice(0, 10);
    const dow = dt.getUTCDay();
    if (byDate[ds]) { out.push({ ...byDate[ds], dow, isToday: ds === todayStr }); }
    else {
      const isWeekend = dow === 0 || dow === 6;
      out.push({ date: ds, dow, isToday: ds === todayStr, isFuture: ds > todayStr, off: isWeekend, present: false });
    }
  }
  return out;
}

// 이번 주 근무 7일 그리드 (항목10)
function WeeklyGrid({ days }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {days.map((d, i) => {
        const isAlert = d.late || d.missing;
        const bg = d.isToday ? W.cellBlue : isAlert ? W.redBg : W.cellBg;
        let content;
        if (d.leave) content = <span style={{ fontSize: 12, fontWeight: 700, color: W.green }}>연차</span>;
        else if (d.off) content = <span style={{ color: W.sub }}>X</span>;
        else if (d.isFuture) content = <span style={{ color: W.sub }}>-</span>;
        else if (d.missing) content = <WarnIcon />;
        else if (d.present) content = (
          <div style={{ fontVariantNumeric: "tabular-nums", color: d.late ? W.red : W.ink, fontWeight: d.late ? 700 : 400, fontSize: 12, lineHeight: 1.5 }}>
            <div>{d.checkInTime ? fmtTime(d.checkInTime) : ""}</div>
            <div style={{ color: W.ink, fontWeight: 400 }}>{d.checkOutTime ? fmtTime(d.checkOutTime) : ""}</div>
          </div>
        );
        else content = <span style={{ color: W.sub }}>-</span>;
        const dowColor = d.dow === 0 ? W.red : d.dow === 6 ? W.blue : W.ink;
        return (
          <div key={i} style={{ flex: 1, background: bg, borderRadius: 8, padding: "6px 2px 10px", position: "relative", minHeight: 74, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: dowColor }}>{DOW[d.dow]}</div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{content}</div>
            {d.noteMiss && <span style={{ position: "absolute", left: 6, right: 6, bottom: 5, height: 2, background: W.red, borderRadius: 1 }} />}
          </div>
        );
      })}
    </div>
  );
}

// 이번 달 요약 (항목11)
function MonthlyGrid({ monthly }) {
  const items = [
    { label: "지각", v: monthly.lateDays ?? 0 },
    { label: "출근누락", v: monthly.missingIn ?? 0 },
    { label: "퇴근누락", v: monthly.missingOut ?? 0 },
    { label: "근무노트", v: monthly.missingNote ?? 0 },
  ];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {items.map((it, i) => {
        const on = it.v > 0;
        return (
          <div key={i} style={{ flex: 1, textAlign: "center", padding: "12px 4px", borderRadius: 10, background: on ? W.redBg : W.cellBg }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: on ? W.red : W.ink }}>{it.label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: on ? W.red : W.ink, marginTop: 6 }}>{it.v}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── 근태 기록(리포트) 페이지 ─────────────────────────────────
function HistoryView({ onBack }) {
  const [expanded, setExpanded] = useState(null);
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).slice(0, 7));

  const todayKST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const currentMonth = () => todayKST().slice(0, 7);

  useEffect(() => {
    const today = todayKST();
    const from = `${month}-01`;
    const [y, mo] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const rawTo = `${month}-${String(lastDay).padStart(2, '0')}`;
    const to = rawTo > today ? today : rawTo;
    if (from > today) return;
    setLoading(true);
    setRecords(null);
    api.getAttendanceHistory({ from, to }).then((h) => setRecords(h.records)).catch(() => {}).finally(() => setLoading(false));
  }, [month]);

  const changeMonth = (delta) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (next > currentMonth()) return;
    setMonth(next);
    setExpanded(null);
  };

  const canGoNext = month < currentMonth();
  const [my, mm] = month.split('-');

  const getBadges = (r) => {
    const badges = [];
    const { status, leaveType, checkOut } = r;
    const ltCI = leaveType === "출근" || leaveType === "출퇴근" || leaveType === "출근+노트" || leaveType === "출퇴근+노트";
    const ltCO = leaveType === "퇴근" || leaveType === "출퇴근" || leaveType === "퇴근+노트" || leaveType === "출퇴근+노트";
    const ltN = leaveType === "노트" || (!!leaveType && leaveType.includes("+노트"));
    const ltBase = leaveType?.replace("+노트", "") || null;
    if (leaveType === "연차") { badges.push({ text: "연차", color: W.green, bg: W.greenBg }); return badges; }
    if (ltBase === "출퇴근") badges.push({ text: "출퇴근인정", color: W.green, bg: W.greenBg });
    else if (ltBase === "출근") badges.push({ text: "출근인정", color: W.green, bg: W.greenBg });
    else if (ltBase === "퇴근") badges.push({ text: "퇴근인정", color: W.green, bg: W.greenBg });
    else if (status === "지각") badges.push({ text: "지각", color: W.amber, bg: W.amberBg });
    else if (status === "조퇴") badges.push({ text: "조퇴", color: W.red, bg: W.redBg });
    else if (status === "지각조퇴") badges.push({ text: "지각·조퇴", color: W.red, bg: W.redBg });
    if (ltN) badges.push({ text: "노트인정", color: W.blue, bg: "#dce9f0" });
    const noOut = !checkOut && !ltCO && (r.checkIn || ltCI);
    if (noOut) badges.push({ text: "퇴근누락", color: W.red, bg: W.redBg });
    return badges;
  };

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: W.ink, padding: "0 4px 0 0", lineHeight: 1 }} onClick={onBack}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: W.ink, margin: 0, flex: 1 }}>근태 리포트</h2>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16, background: W.card, borderRadius: 12, padding: "10px 0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: W.ink, padding: "0 8px", lineHeight: 1 }} onClick={() => changeMonth(-1)}>‹</button>
        <span style={{ fontWeight: 800, fontSize: 15, color: W.ink }}>{my}년 {parseInt(mm, 10)}월</span>
        <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: canGoNext ? W.ink : "#ccc", padding: "0 8px", lineHeight: 1 }} onClick={() => changeMonth(1)} disabled={!canGoNext}>›</button>
      </div>

      {loading && <div style={S.empty}>불러오는 중…</div>}
      {!loading && (!records || records.length === 0) && <div style={S.empty}>근태 기록이 없습니다.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(records || []).map((r, i) => {
          const isOpen = expanded === r.date;
          const dayIdx = new Date(r.date + "T12:00:00Z").getUTCDay();
          const dow = DOW[dayIdx];
          const isWeekend = dayIdx === 0 || dayIdx === 6;
          const badges = getBadges(r);
          const hasNotes = r.noteIn || r.noteOut || r.noteField || r.noteToday;
          return (
            <div key={i} style={{ background: W.card, borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div style={{ padding: "13px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }} onClick={() => setExpanded(isOpen ? null : r.date)}>
                <div style={{ width: 40, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isWeekend ? W.red : W.ink, lineHeight: 1 }}>{r.date.slice(5).replace("-", "/")}</div>
                  <div style={{ fontSize: 10, color: isWeekend ? W.red : W.sub, marginTop: 2 }}>{dow}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r.leaveType === "연차" ? (
                    <span style={{ fontSize: 14, color: "#176ca5", fontWeight: 700 }}>연차</span>
                  ) : r.checkIn ? (
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: W.ink, fontVariantNumeric: "tabular-nums", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {fmtTime(r.checkIn.time)} - {r.checkOut ? fmtTime(r.checkOut.time) : <WarnIcon size={14} />}
                      </span>
                      {r.workMinutes != null && <div style={{ fontSize: 11, color: W.sub, marginTop: 2 }}>{fmtDur(r.workMinutes)}</div>}
                    </div>
                  ) : (
                    <span style={{ fontSize: 14, color: W.red }}>출근 누락</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 120 }}>
                  {badges.map((b, bi) => (
                    <span key={bi} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: b.bg, color: b.color }}>{b.text}</span>
                  ))}
                  {(hasNotes || r.checkIn) && <span style={{ fontSize: 11, color: W.sub }}>{isOpen ? "▲" : "▼"}</span>}
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: "12px 16px 14px", background: W.bg, borderTop: `1px solid #e6ebef`, display: "flex", flexDirection: "column", gap: 10 }}>
                  {r.checkIn && <NoteRow label="출근 장소" text={r.noteIn} />}
                  {r.checkOut && <NoteRow label="퇴근 장소" text={r.noteOut} />}
                  {r.noteField && <NoteRow label="외근 장소" text={r.noteField} />}
                  {r.noteToday && <NoteRow label="오늘 업무" text={r.noteToday} />}
                  {!hasNotes && <span style={{ fontSize: 12, color: W.sub }}>작성된 근무 노트가 없습니다.</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NoteRow({ label, text }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: W.sub, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: text ? W.ink : W.sub, lineHeight: 1.5 }}>{text || "—"}</div>
    </div>
  );
}

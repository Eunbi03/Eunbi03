import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { fmtTime, fmtDur } from "../utils/format.js";
import { getLocation, startLocationWatch, stopLocationWatch, checkLocationPermission } from "../utils/device.js";
import MoveForm from "./MoveForm.jsx";
import OutForm from "./OutForm.jsx";
import TimeChangeForm from "./TimeChangeForm.jsx";
import useRandomCheckPolling from "../hooks/useRandomCheckPolling.js";
import RandomCheckModal from "./RandomCheckModal.jsx";
import * as api from "../api/client.js";

function todayLabel() {
  const now = new Date();
  const opt = { timeZone: "Asia/Seoul" };
  const m = now.toLocaleString("ko-KR", { ...opt, month: "numeric" });
  const d = now.toLocaleString("ko-KR", { ...opt, day: "numeric" });
  const dow = now.toLocaleString("ko-KR", { ...opt, weekday: "short" });
  return `${m}/${d} (${dow})`;
}

function StatusBadge({ isCheckedIn, isCheckedOut, leaveType }) {
  if (leaveType === "연차")
    return <span style={{ ...badgeStyle, background: C.greenSoft, color: C.green }}>연차</span>;
  if (isCheckedOut)
    return <span style={{ ...badgeStyle, background: "#f0f0f0", color: C.inkSoft }}>퇴근 완료</span>;
  if (isCheckedIn)
    return <span style={{ ...badgeStyle, background: C.greenSoft, color: C.green }}>근무 중</span>;
  return <span style={{ ...badgeStyle, background: C.amberSoft, color: C.amber }}>미출근</span>;
}
const badgeStyle = { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0 };

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
  const [historyRecords, setHistoryRecords] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isCheckedIn = !!today?.checkIn?.time;
  const isCheckedOut = !!today?.checkOut?.time;
  const activeOuting = today?.outings?.find((o) => !o.endTime) ?? null;

  const { pendingCheck, dismiss } = useRandomCheckPolling(isCheckedIn && !isCheckedOut);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [t, w] = await Promise.all([api.getAttendanceToday(), api.getWeeklySummary()]);
      setToday(t.record || null);
      if (t.schedule) setSchedule(t.schedule);
      setWeekly(w);
    } catch (e) {
      setErr(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    checkLocationPermission().then((state) => {
      if (state !== "granted") setGpsBanner(true);
    });
  }, []);

  useEffect(() => {
    if (isCheckedIn && !isCheckedOut) startLocationWatch();
    else stopLocationWatch();
    return () => { if (isCheckedOut) stopLocationWatch(); };
  }, [isCheckedIn, isCheckedOut]);

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

  const endOuting = async () => {
    if (!activeOuting) return;
    setBusy(true); setErr("");
    try {
      await api.endOuting(activeOuting.id);
      setMsg("복귀 완료!");
      load(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const loadMonthly = async () => {
    if (monthly) { setShowMonthly(!showMonthly); return; }
    try {
      const m = await api.getMonthlySummary();
      setMonthly(m); setShowMonthly(true);
    } catch (e) { setErr(e.message); }
  };

  const loadHistory = async () => {
    setView("history");
    if (historyRecords) return;
    setHistoryLoading(true);
    try {
      const h = await api.getAttendanceHistory();
      setHistoryRecords(h.records);
    } catch (e) { setErr(e.message); }
    finally { setHistoryLoading(false); }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  if (view === "outing") return (
    <div style={{ padding: "16px 16px 40px" }}>
      <MoveForm onClose={() => setView("main")} onDone={() => { setView("main"); load(true); }} />
    </div>
  );
  if (view === "out") return (
    <div style={{ padding: "16px 16px 40px" }}>
      <OutForm user={user} workplaceId={user.workplaceId} onClose={() => setView("main")} onDone={() => { setView("main"); load(true); }} />
    </div>
  );
  if (view === "timechange") return (
    <div style={{ padding: "16px 16px 40px" }}>
      <TimeChangeForm onClose={() => setView("main")} onDone={() => { setView("main"); setMsg("퇴근 시간 변경 요청이 전송되었습니다."); load(true); }} />
    </div>
  );
  if (view === "history") return (
    <HistoryView
      records={historyRecords}
      loading={historyLoading}
      onBack={() => setView("main")}
      onRefresh={async () => {
        setHistoryLoading(true);
        try { const h = await api.getAttendanceHistory(); setHistoryRecords(h.records); }
        catch (e) { setErr(e.message); }
        finally { setHistoryLoading(false); }
      }}
    />
  );

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      {pendingCheck && <RandomCheckModal check={pendingCheck} onDone={() => { dismiss(); load(true); }} />}

      {/* GPS 권한 안내 배너 */}
      {gpsBanner && !isCheckedIn && (
        <div style={{ background: C.amberSoft, borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: C.amber, lineHeight: 1.6 }}>
          <strong>📍 위치 항상 허용 필요</strong><br />
          출근 버튼을 누르면 위치를 요청합니다. <strong>"항상 허용"</strong>을 선택해야 랜덤 위치 확인이 가능합니다.
        </div>
      )}

      {msg && <div style={{ ...S.busy, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ ...S.err, marginBottom: 12 }}>{err}</div>}

      {/* ── 오늘 근무 카드 ── */}
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden", marginBottom: 12 }}>

        {/* 카드 헤더: 날짜 + 상태 */}
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 600, marginBottom: 2 }}>오늘 근무</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{todayLabel()}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>{schedule.start} – {schedule.end}</div>
          </div>
          <StatusBadge isCheckedIn={isCheckedIn} isCheckedOut={isCheckedOut} leaveType={today?.leaveType} />
        </div>

        {/* 출퇴근 시간 */}
        {today?.checkIn?.time ? (
          <div style={{ padding: "14px 18px" }}>
            <TimeRow label="출근" time={today.checkIn.time} color={C.green} />
            {today.checkOut?.time && <TimeRow label="퇴근" time={today.checkOut.time} color={C.ink} />}
            {today.workMinutes != null && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>총 근로시간</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{fmtDur(today.workMinutes)}</span>
              </div>
            )}

            {/* 외출 중 안내 */}
            {activeOuting && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: C.amberSoft, borderRadius: 8, fontSize: 12, color: C.amber, fontWeight: 700 }}>
                외출 중{activeOuting.destination ? ` · ${activeOuting.destination}` : ""}
              </div>
            )}
            {today.leaveType && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: C.greenSoft, borderRadius: 8, fontSize: 12, color: C.green, fontWeight: 700 }}>
                {today.leaveType === "연차" ? "연차 처리된 날입니다." : today.leaveType === "출근" ? "출근 인정 처리되었습니다." : "퇴근 인정 처리되었습니다."}
              </div>
            )}
            {today.timeChangeStatus === "pending" && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: C.amberSoft, borderRadius: 8, fontSize: 12, color: C.amber, fontWeight: 700 }}>
                퇴근 시간 변경 요청 검토 중…
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "22px 18px", textAlign: "center", color: C.inkSoft, fontSize: 13 }}>
            {today?.leaveType === "연차" ? "오늘은 연차 처리된 날입니다." : "아직 출근 전입니다."}
          </div>
        )}

        {/* 액션 버튼 */}
        {isCheckedOut ? (
          <div style={{ padding: "4px 18px 16px", textAlign: "center", fontSize: 12, color: C.inkSoft }}>
            오늘 퇴근 완료. 수고하셨습니다! 🎉
          </div>
        ) : (
          <>
            {(!isCheckedIn && today?.leaveType !== "연차") && (
              <div style={{ padding: "0 18px 16px" }}>
                <button style={{ ...S.primary, width: "100%", fontSize: 16, padding: "14px", opacity: busy ? 0.6 : 1 }} onClick={checkIn} disabled={busy}>
                  {busy ? "처리 중…" : "출근하기"}
                </button>
              </div>
            )}
            {isCheckedIn && !isCheckedOut && (
              <div style={{ padding: "0 18px 16px", display: "flex", gap: 8 }}>
                {activeOuting ? (
                  <button style={{ ...S.primary, flex: 1, background: C.green, opacity: busy ? 0.6 : 1 }} onClick={endOuting} disabled={busy}>
                    {busy ? "처리 중…" : "복귀"}
                  </button>
                ) : (
                  <button style={{ ...S.primary, flex: 1, background: C.amberSoft, color: C.amber, boxShadow: "none", border: `1px solid ${C.amber}` }} onClick={() => setView("outing")}>
                    외출
                  </button>
                )}
                <button style={{ ...S.primary, flex: 2 }} onClick={() => setView("out")}>퇴근</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 퇴근 시간 변경 요청 */}
      {isCheckedIn && !isCheckedOut && !today?.timeChangeStatus && (
        <button style={{ ...S.subGhost, width: "100%", marginBottom: 8 }} onClick={() => setView("timechange")}>
          퇴근 시간 변경 요청
        </button>
      )}

      {/* ── 이번 주 요약 ── */}
      <div style={{ marginBottom: 8 }}>
        <button style={{ ...S.subGhost, width: "100%" }} onClick={() => setShowWeekly(!showWeekly)}>
          {showWeekly ? "이번 주 요약 닫기 ▲" : "이번 주 요약 보기 ▼"}
        </button>
        {showWeekly && weekly && <WeeklyCard weekly={weekly} />}
      </div>

      {/* ── 이번 달 요약 ── */}
      <div style={{ marginBottom: 8 }}>
        <button style={{ ...S.subGhost, width: "100%" }} onClick={loadMonthly}>
          {showMonthly ? "이번 달 요약 닫기 ▲" : "이번 달 요약 보기 ▼"}
        </button>
        {showMonthly && monthly && (
          <SummaryCard title="이번 달 요약">
            <SummaryGrid items={[
              { label: "출근일", value: monthly.workedDays, color: C.green },
              ...(monthly.leaveDays > 0 ? [{ label: "연차", value: monthly.leaveDays, color: C.green }] : []),
              { label: "지각", value: monthly.lateDays, color: C.amber },
              { label: "조퇴", value: monthly.earlyLeaveDays, color: C.seal },
              { label: "총 근무", value: monthly.totalWorkMinutes ? fmtDur(monthly.totalWorkMinutes) : "—", color: C.ink },
            ]} />
          </SummaryCard>
        )}
      </div>

      {/* ── 근태 기록 보기 ── */}
      <button style={{ ...S.subGhost, width: "100%", fontWeight: 700 }} onClick={loadHistory} disabled={historyLoading}>
        {historyLoading ? "불러오는 중…" : "내 근태 기록 보기 →"}
      </button>
    </div>
  );
}

function TimeRow({ label, time, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 13, color: C.inkSoft }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{fmtTime(time)}</span>
    </div>
  );
}

function SummaryCard({ title, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "14px 16px", marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function WeeklyCard({ weekly }) {
  const days = weekly.days || [];
  return (
    <SummaryCard title="이번 주 요약">
      {days.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {days.map((d, i) => {
            const idx = new Date(d.date + "T12:00:00Z").getUTCDay();
            const dow = ["일", "월", "화", "수", "목", "금", "토"][idx];
            const isToday = d.date === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
            const isLeave = d.leaveType === "연차";
            const hasWork = d.minutesWorked > 0;
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: C.inkSoft, marginBottom: 4 }}>{dow}</div>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", margin: "0 auto",
                  background: isToday ? C.ink : isLeave ? C.greenSoft : hasWork ? C.greenSoft : "#f0f0f0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: isToday ? "#fff" : isLeave || hasWork ? C.green : C.inkSoft }}>
                    {isLeave ? "연" : hasWork ? "✓" : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <SummaryGrid items={[
        { label: "출근일", value: weekly.workedDays, color: C.green },
        ...(weekly.leaveDays > 0 ? [{ label: "연차", value: weekly.leaveDays, color: C.green }] : []),
        { label: "지각", value: weekly.lateDays, color: C.amber },
        { label: "조퇴", value: weekly.earlyLeaveDays, color: C.seal },
        { label: "총 근무", value: weekly.totalWorkMinutes ? fmtDur(weekly.totalWorkMinutes) : "—", color: C.ink },
      ]} />
    </SummaryCard>
  );
}

function SummaryGrid({ items }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item, i) => (
        <div key={i} style={{ flex: "1 1 auto", minWidth: 56, textAlign: "center", padding: "10px 6px", background: C.paper, borderRadius: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
          <div style={{ fontSize: 10, color: C.inkSoft, marginTop: 4 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── 근태 기록 페이지 ──────────────────────────────────────────

function HistoryView({ records, loading, onBack, onRefresh }) {
  const [expanded, setExpanded] = useState(null);

  const statusBadge = (status, leaveType) => {
    if (leaveType === "연차") return { text: "연차", color: C.green, bg: C.greenSoft };
    if (leaveType === "출근") return { text: "출근인정", color: C.green, bg: C.greenSoft };
    if (leaveType === "퇴근") return { text: "퇴근인정", color: C.green, bg: C.greenSoft };
    if (!status) return null;
    if (status === "지각") return { text: "지각", color: C.amber, bg: C.amberSoft };
    if (status === "조퇴") return { text: "조퇴", color: C.seal, bg: C.sealSoft };
    if (status === "지각조퇴") return { text: "지각·조퇴", color: C.seal, bg: C.sealSoft };
    return { text: "정상", color: C.green, bg: C.greenSoft };
  };

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.ink, padding: "0 4px 0 0", lineHeight: 1 }} onClick={onBack}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: C.ink, margin: 0, flex: 1 }}>내 근태 기록</h2>
        <button style={{ ...S.miniBtn }} onClick={onRefresh}>↻</button>
      </div>

      {loading && <div style={S.empty}>불러오는 중…</div>}
      {!loading && (!records || records.length === 0) && <div style={S.empty}>근태 기록이 없습니다.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(records || []).map((r, i) => {
          const isOpen = expanded === r.date;
          const dayIdx = new Date(r.date + "T12:00:00Z").getUTCDay();
          const dow = ["일", "월", "화", "수", "목", "금", "토"][dayIdx];
          const isWeekend = dayIdx === 0 || dayIdx === 6;
          const badge = statusBadge(r.status, r.leaveType);
          const hasNotes = r.noteIn || r.noteOut || r.noteField || r.noteToday;

          return (
            <div key={i} style={{ background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <div
                style={{ padding: "13px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onClick={() => setExpanded(isOpen ? null : r.date)}
              >
                {/* 날짜 */}
                <div style={{ width: 38, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isWeekend ? C.seal : C.ink, lineHeight: 1 }}>
                    {r.date.slice(5).replace("-", "/")}
                  </div>
                  <div style={{ fontSize: 10, color: isWeekend ? C.seal : C.inkSoft, marginTop: 2 }}>{dow}</div>
                </div>

                {/* 시간 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {r.leaveType === "연차" ? (
                    <span style={{ fontSize: 14, color: C.green, fontWeight: 700 }}>연차</span>
                  ) : r.checkIn ? (
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.green, fontVariantNumeric: "tabular-nums" }}>{fmtTime(r.checkIn.time)}</span>
                      {r.checkOut && (
                        <span style={{ fontSize: 14, color: C.ink, fontVariantNumeric: "tabular-nums" }}> → {fmtTime(r.checkOut.time)}</span>
                      )}
                      {r.workMinutes != null && (
                        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{fmtDur(r.workMinutes)}</div>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 14, color: C.seal }}>출근 누락</span>
                  )}
                </div>

                {/* 배지 + 화살표 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {badge && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: badge.bg, color: badge.color }}>
                      {badge.text}
                    </span>
                  )}
                  {(hasNotes || r.checkIn) && (
                    <span style={{ fontSize: 11, color: C.inkSoft }}>{isOpen ? "▲" : "▼"}</span>
                  )}
                </div>
              </div>

              {/* 펼침: 근무 노트 */}
              {isOpen && (
                <div style={{ padding: "12px 16px 14px", background: C.paper, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
                  {r.checkIn && <NoteRow label="출근 장소" text={r.noteIn} />}
                  {r.checkOut && <NoteRow label="퇴근 장소" text={r.noteOut} />}
                  {r.noteField && <NoteRow label="외근 장소" text={r.noteField} />}
                  {r.noteToday && <NoteRow label="오늘 업무" text={r.noteToday} />}
                  {!hasNotes && <span style={{ fontSize: 12, color: C.inkSoft }}>작성된 근무 노트가 없습니다.</span>}
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
      <div style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: text ? C.ink : C.inkSoft, lineHeight: 1.5 }}>{text || "—"}</div>
    </div>
  );
}

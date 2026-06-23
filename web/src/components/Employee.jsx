import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { fmtTime, fmtDur } from "../utils/format.js";
import { getLocation, locText, mapUrl } from "../utils/device.js";
import { Kpi } from "./Small.jsx";
import Timeline from "./Timeline.jsx";
import MoveForm from "./MoveForm.jsx";
import OutForm from "./OutForm.jsx";
import TimeChangeForm from "./TimeChangeForm.jsx";
import useRandomCheckPolling from "../hooks/useRandomCheckPolling.js";
import RandomCheckModal from "./RandomCheckModal.jsx";
import * as api from "../api/client.js";

export default function Employee({ user }) {
  const [today, setToday] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [view, setView] = useState("main"); // main | outing | out | timechange
  const [showWeekly, setShowWeekly] = useState(false);

  const isCheckedIn = !!today?.checkIn?.time;
  const isCheckedOut = !!today?.checkOut?.time;
  const activeOuting = today?.outings?.find((o) => !o.endTime) || null;

  const { pendingCheck, dismiss } = useRandomCheckPolling(isCheckedIn && !isCheckedOut);

  const load = async () => {
    setLoading(true);
    try {
      const [t, w] = await Promise.all([api.getAttendanceToday(), api.getWeeklySummary()]);
      setToday(t.record || null);
      setWeekly(w);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const checkIn = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const loc = await getLocation();
      await api.checkIn(loc, user.workplaceId);
      setMsg("출근 완료!");
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const endOuting = async () => {
    if (!activeOuting) return;
    setBusy(true);
    setErr("");
    try {
      await api.endOuting(activeOuting.id);
      setMsg("복귀 완료!");
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  if (view === "outing") {
    return (
      <div style={{ padding: "16px 16px 40px" }}>
        <MoveForm onClose={() => setView("main")} onDone={() => { setView("main"); load(); }} />
      </div>
    );
  }

  if (view === "out") {
    return (
      <div style={{ padding: "16px 16px 40px" }}>
        <OutForm user={user} workplaceId={user.workplaceId} onClose={() => setView("main")} onDone={() => { setView("main"); load(); }} />
      </div>
    );
  }

  if (view === "timechange") {
    return (
      <div style={{ padding: "16px 16px 40px" }}>
        <TimeChangeForm onClose={() => setView("main")} onDone={() => { setView("main"); setMsg("퇴근 시간 변경 요청이 전송되었습니다."); load(); }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      {pendingCheck && (
        <RandomCheckModal check={pendingCheck} onDone={() => { dismiss(); load(); }} />
      )}

      {msg && <div style={{ ...S.busy, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ ...S.err, marginBottom: 12 }}>{err}</div>}

      <div style={S.formCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ ...S.formTitle, marginBottom: 0 }}>오늘 근태</p>
          {today?.workMinutes != null && (
            <span style={{ fontSize: 12, color: C.inkSoft }}>근무 {fmtDur(today.workMinutes)}</span>
          )}
        </div>

        {today?.checkIn?.time ? (
          <Timeline record={today} />
        ) : (
          <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "center", padding: "16px 0" }}>아직 출근 전입니다.</div>
        )}

        {today?.timeChangeStatus === "pending" && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: C.amberSoft, borderRadius: 8, fontSize: 12, color: C.amber, fontWeight: 700 }}>
            퇴근 시간 변경 요청 검토 중…
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {!isCheckedIn && !isCheckedOut && (
          <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} onClick={checkIn} disabled={busy}>
            {busy ? "처리 중…" : "출근"}
          </button>
        )}

        {isCheckedIn && !isCheckedOut && (
          <>
            {activeOuting ? (
              <button style={{ ...S.primary, background: C.green, opacity: busy ? 0.6 : 1 }} onClick={endOuting} disabled={busy}>
                {busy ? "처리 중…" : "복귀"}
              </button>
            ) : (
              <button style={{ ...S.subPrimary, background: C.amber }} onClick={() => setView("outing")}>
                외출
              </button>
            )}
            <button style={{ ...S.primary, background: C.ink }} onClick={() => setView("out")}>퇴근</button>
            {!today?.timeChangeStatus && (
              <button style={S.subGhost} onClick={() => setView("timechange")}>퇴근 시간 변경 요청</button>
            )}
          </>
        )}

        {isCheckedOut && (
          <div style={{ textAlign: "center", fontSize: 14, color: C.inkSoft, padding: "8px 0" }}>
            오늘 퇴근이 완료되었습니다.
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <button style={{ ...S.subGhost, width: "100%" }} onClick={() => setShowWeekly(!showWeekly)}>
          {showWeekly ? "주간 요약 닫기" : "이번 주 요약 보기"}
        </button>
        {showWeekly && weekly && (
          <div style={{ ...S.formCard, marginTop: 8, marginBottom: 0 }}>
            <p style={S.formTitle}>이번 주 요약</p>
            <div style={S.kpiRow}>
              <Kpi label="출근일" value={weekly.workedDays} color={C.green} />
              <Kpi label="지각" value={weekly.lateDays} color={C.amber} />
              <Kpi label="조퇴" value={weekly.earlyLeaveDays} color={C.seal} />
              <Kpi label="총 근무" value={weekly.totalWorkMinutes ? fmtDur(weekly.totalWorkMinutes) : "—"} color={C.ink} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

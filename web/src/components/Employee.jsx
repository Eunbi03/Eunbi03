import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import { fmtTime, fmtDur } from "../utils/format.js";
import { getLocation, startLocationWatch, stopLocationWatch, checkLocationPermission } from "../utils/device.js";
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
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [view, setView] = useState("main");
  const [showWeekly, setShowWeekly] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [gpsBanner, setGpsBanner] = useState(false);

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

  useEffect(() => {
    load();
    // GPS 권한 상태 확인
    checkLocationPermission().then((state) => {
      if (state !== 'granted') setGpsBanner(true);
    });
  }, []);

  // 출근 중이면 GPS 상시 감지
  useEffect(() => {
    if (isCheckedIn && !isCheckedOut) {
      startLocationWatch();
    } else {
      stopLocationWatch();
    }
    return () => { if (isCheckedOut) stopLocationWatch(); };
  }, [isCheckedIn, isCheckedOut]);

  const checkIn = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const loc = await getLocation();
      await api.checkIn(loc, user.workplaceId);
      setMsg("출근 완료!");
      setGpsBanner(false);
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

  const loadMonthly = async () => {
    if (monthly) { setShowMonthly(!showMonthly); return; }
    try {
      const m = await api.getMonthlySummary();
      setMonthly(m);
      setShowMonthly(true);
    } catch (e) { setErr(e.message); }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  if (view === "outing") return (
    <div style={{ padding: "16px 16px 40px" }}>
      <MoveForm onClose={() => setView("main")} onDone={() => { setView("main"); load(); }} />
    </div>
  );
  if (view === "out") return (
    <div style={{ padding: "16px 16px 40px" }}>
      <OutForm user={user} workplaceId={user.workplaceId} onClose={() => setView("main")} onDone={() => { setView("main"); load(); }} />
    </div>
  );
  if (view === "timechange") return (
    <div style={{ padding: "16px 16px 40px" }}>
      <TimeChangeForm onClose={() => setView("main")} onDone={() => { setView("main"); setMsg("퇴근 시간 변경 요청이 전송되었습니다."); load(); }} />
    </div>
  );

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      {pendingCheck && <RandomCheckModal check={pendingCheck} onDone={() => { dismiss(); load(); }} />}

      {/* GPS 권한 안내 */}
      {gpsBanner && !isCheckedIn && (
        <div style={{ background: C.amberSoft, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: C.amber, lineHeight: 1.6 }}>
          <strong>📍 위치 권한 안내</strong><br />
          출근 버튼을 누르면 위치 권한을 요청합니다.<br />
          <strong>"항상 허용"</strong> 또는 <strong>"이 사이트에서 허용"</strong>을 선택해야 랜덤 위치 확인이 가능합니다.
        </div>
      )}

      {msg && <div style={{ ...S.busy, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ ...S.err, marginBottom: 12 }}>{err}</div>}

      {/* 오늘 근태 카드 */}
      <div style={S.formCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ ...S.formTitle, marginBottom: 0 }}>오늘 근태</p>
          {today?.workMinutes != null && (
            <span style={{ fontSize: 12, color: C.inkSoft }}>근무 {fmtDur(today.workMinutes)}</span>
          )}
        </div>

        {/* 출퇴근 시각 */}
        {today?.checkIn?.time ? (
          <div style={{ display: "flex", gap: 16, marginBottom: 12, padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700 }}>출근</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: C.green, fontVariantNumeric: "tabular-nums" }}>
                {fmtTime(today.checkIn.time)}
              </span>
            </div>
            {today?.checkOut?.time && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700 }}>퇴근</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                  {fmtTime(today.checkOut.time)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.inkSoft, textAlign: "center", padding: "16px 0" }}>아직 출근 전입니다.</div>
        )}

        {today?.checkIn?.time && <Timeline record={today} />}

        {today?.timeChangeStatus === "pending" && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: C.amberSoft, borderRadius: 8, fontSize: 12, color: C.amber, fontWeight: 700 }}>
            퇴근 시간 변경 요청 검토 중…
          </div>
        )}
      </div>

      {/* 버튼 영역 - 카드와 간격 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
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

      {/* 이번 주 요약 */}
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

      {/* 이번 달 요약 */}
      <div style={{ marginTop: 8 }}>
        <button style={{ ...S.subGhost, width: "100%" }} onClick={loadMonthly}>
          {showMonthly ? "월간 요약 닫기" : "이번 달 요약 보기"}
        </button>
        {showMonthly && monthly && (
          <div style={{ ...S.formCard, marginTop: 8, marginBottom: 0 }}>
            <p style={S.formTitle}>이번 달 요약</p>
            <div style={S.kpiRow}>
              <Kpi label="출근일" value={monthly.workedDays} color={C.green} />
              <Kpi label="지각" value={monthly.lateDays} color={C.amber} />
              <Kpi label="조퇴" value={monthly.earlyLeaveDays} color={C.seal} />
              <Kpi label="총 근무" value={monthly.totalWorkMinutes ? fmtDur(monthly.totalWorkMinutes) : "—"} color={C.ink} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

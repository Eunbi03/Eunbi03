import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); }
function monthStart() { return todayStr().slice(0, 7) + "-01"; }
function fmtTime(t) { if (!t) return "—"; return new Date(t).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }); }
function fmtDist(m) { if (m == null) return null; return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`; }
function mapsUrl(lat, lng) { return `https://maps.google.com/?q=${lat},${lng}`; }

function LeavePopup({ day, onSelect, onClose }) {
  const OPTIONS = [
    { key: "연차", label: "연차", sub: "하루 전체 인정" },
    { key: "출근", label: "출근 인정", sub: "출근 누락·지각 해소" },
    { key: "퇴근", label: "퇴근 인정", sub: "퇴근 누락 해소" },
  ];
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", minWidth: 240, textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 14 }}>
          {day.date.slice(5)} 출퇴근 인정 설정
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OPTIONS.map(({ key, label, sub }) => (
            <button
              key={key}
              style={{
                padding: "11px", borderRadius: 10, border: `1px solid ${day.leaveType === key ? C.green : C.line}`,
                background: day.leaveType === key ? C.greenSoft : "#fff",
                color: day.leaveType === key ? C.green : C.ink,
                fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}
              onClick={() => onSelect(key)}
            >
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: day.leaveType === key ? C.green : C.inkSoft }}>{sub}{day.leaveType === key ? " ✓" : ""}</span>
            </button>
          ))}
          {day.leaveType && (
            <button
              style={{ padding: "10px", borderRadius: 10, border: `1px solid ${C.sealSoft}`, background: C.sealSoft, color: C.seal, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              onClick={() => onSelect(null)}
            >
              설정 취소
            </button>
          )}
        </div>
        <button
          style={{ marginTop: 12, background: "none", border: "none", fontSize: 13, color: C.inkSoft, cursor: "pointer" }}
          onClick={onClose}
        >닫기</button>
      </div>
    </div>
  );
}

function DayRow({ day, wpLat, wpLng, onLeaveChange }) {
  const [open, setOpen] = useState(false);
  const [leavePopup, setLeavePopup] = useState(false);
  const isAlert = day.isLate || day.noOut || day.missing;

  const openPopup = (e) => { e.stopPropagation(); setLeavePopup(true); };

  const popup = leavePopup && onLeaveChange && (
    <LeavePopup
      day={day}
      onSelect={(t) => { onLeaveChange(day, t); setLeavePopup(false); }}
      onClose={() => setLeavePopup(false)}
    />
  );

  const leaveBtn = onLeaveChange && (
    <button
      style={{ ...S.miniBtn, marginLeft: "auto", fontSize: 11, flexShrink: 0 }}
      onClick={openPopup}
    >
      인정 ▾
    </button>
  );

  if (day.leaveType === '연차') {
    return (
      <>
        {popup}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.inkSoft, width: 52, flexShrink: 0 }}>{day.date.slice(5)}</span>
          <span style={{ ...S.badge, background: C.greenSoft, color: C.green, fontSize: 11 }}>연차</span>
          {leaveBtn}
        </div>
      </>
    );
  }

  if (day.missing) {
    return (
      <>
        {popup}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 8, background: "#fff5f5" }}>
          <span style={{ fontSize: 12, color: C.seal, width: 52, flexShrink: 0 }}>{day.date.slice(5)}</span>
          <span style={{ ...S.badge, background: C.sealSoft, color: C.seal, fontSize: 11 }}>출근 누락</span>
          {leaveBtn}
        </div>
      </>
    );
  }

  return (
    <>
      {popup}
      <div style={{ borderBottom: `1px solid ${C.line}` }}>
        <div
          style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: isAlert ? "#fff5f5" : "#fff" }}
          onClick={() => setOpen((o) => !o)}
        >
          <span style={{ fontSize: 12, color: isAlert ? C.seal : C.inkSoft, width: 52, flexShrink: 0 }}>{day.date.slice(5)}</span>
          <span style={{ flex: 1, fontSize: 13, color: isAlert ? C.seal : C.ink, fontVariantNumeric: "tabular-nums", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fmtTime(day.checkIn?.time)} → {day.checkOut ? fmtTime(day.checkOut.time) : "퇴근 누락"}
          </span>
          {day.leaveType === '출근' && <Badge color={C.green} bg={C.greenSoft} text="출근인정" />}
          {day.leaveType === '퇴근' && <Badge color={C.green} bg={C.greenSoft} text="퇴근인정" />}
          {day.isLate  && <Badge color={C.amber}  bg={C.amberSoft} text="지각" />}
          {day.noOut   && <Badge color={C.seal}   bg={C.sealSoft}  text="퇴근누락" />}
          {day.noNote  && <Badge color={C.blue}   bg={C.blueSoft}  text="노트누락" />}
          {leaveBtn}
          <span style={{ fontSize: 11, color: C.inkSoft, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        </div>

        {open && (
          <div style={{ padding: "10px 14px", background: C.paper, fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <LocRow label="출근지" time={day.checkIn?.time} lat={day.checkIn?.lat} lng={day.checkIn?.lng} dist={day.checkIn?.distanceM} note={day.checkIn?.note} />
            {day.checkOut && <LocRow label="퇴근지" time={day.checkOut.time} lat={day.checkOut.lat} lng={day.checkOut.lng} dist={day.checkOut.distanceM} note={day.checkOut.note} isField={day.checkOut.isField} />}

            {day.outings?.map((o, i) => (
              <div key={i} style={{ paddingLeft: 8, borderLeft: `3px solid ${C.amberSoft}` }}>
                <span style={{ fontWeight: 700, color: C.amber }}>외근</span>
                <span style={{ color: C.inkSoft, marginLeft: 6 }}>{fmtTime(o.start_time)} → {fmtTime(o.end_time)}</span>
                <span style={{ marginLeft: 6 }}>{o.destination}</span>
                {o.start_lat && <a href={mapsUrl(o.start_lat, o.start_lng)} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 11, color: C.blue }}>지도</a>}
              </div>
            ))}

            {day.noteField && <NoteRow label="외근장소" text={day.noteField} />}
            {day.noteToday && <NoteRow label="오늘업무" text={day.noteToday} />}

            {day.randomChecks?.map((rc, i) => (
              <div key={i} style={{ fontSize: 11, color: C.inkSoft }}>
                랜덤확인 {fmtTime(rc.scheduled_time)}: {rc.submitted_time ? (rc.is_within_radius ? "✅ 근무지 내" : "⚠️ 근무지 외") : "미응답"}
                {rc.lat && <a href={mapsUrl(rc.lat, rc.lng)} target="_blank" rel="noreferrer" style={{ marginLeft: 6, color: C.blue }}>지도</a>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function LocRow({ label, time, lat, lng, dist, note, isField }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <span style={{ fontWeight: 700, color: C.inkSoft, width: 44, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.ink }}>{fmtTime(time)}</span>
      {note && <span style={{ color: C.inkSoft }}>{note}</span>}
      {dist != null && <span style={{ color: dist > 200 ? C.seal : C.green, fontWeight: 700 }}>({fmtDist(dist)})</span>}
      {isField && <span style={{ ...S.badge, background: C.amberSoft, color: C.amber, fontSize: 10 }}>외근</span>}
      {lat && <a href={mapsUrl(lat, lng)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.blue }}>지도</a>}
    </div>
  );
}

function NoteRow({ label, text }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <span style={{ fontWeight: 700, color: C.inkSoft, width: 44, flexShrink: 0 }}>{label}</span>
      <span style={{ color: C.ink, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function Badge({ color, bg, text }) {
  return <span style={{ ...S.badge, color, background: bg, fontSize: 10, flexShrink: 0 }}>{text}</span>;
}

export default function AdminIndividual({ filters }) {
  const today = todayStr();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today);
  const [workers, setWorkers] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [reportMap, setReportMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setListLoading(true);
    api.getWorkers({}).then((d) => { setWorkers(d.workers); }).finally(() => setListLoading(false));
  }, []);

  const visibleWorkers = workers.filter((w) => {
    if (w.role === 'admin' || w.role === 'hr') return false;
    if (filters.corp && w.corp !== filters.corp) return false;
    if (filters.team && w.team !== filters.team) return false;
    return true;
  });

  const toggle = async (w) => {
    if (openId === w.id) { setOpenId(null); return; }
    setOpenId(w.id);
    if (reportMap[w.id]?.from === from && reportMap[w.id]?.to === to) return;
    setLoadingId(w.id);
    try {
      const r = await api.getIndividualReport({ userId: w.id, from, to });
      setReportMap((m) => ({ ...m, [w.id]: { ...r, from, to } }));
    } catch (e) { setMsg(e.message); }
    finally { setLoadingId(null); }
  };

  const handleLeave = async (worker, day, leaveType) => {
    try {
      await api.setLeaveDday({ userId: worker.id, date: day.date, leaveType });
      setMsg(leaveType ? `${day.date} ${leaveType} 인정 처리 완료` : `${day.date} 인정 설정 취소`);
      const r = await api.getIndividualReport({ userId: worker.id, from, to });
      setReportMap((m) => ({ ...m, [worker.id]: { ...r, from, to } }));
    } catch (e) { setMsg(e.message); }
  };

  if (listLoading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      {msg && <div style={{ ...S.busy, marginBottom: 10 }}>{msg}</div>}

      {/* 기간 설정 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700 }}>기간</span>
        <input type="date" max={today} value={from} onChange={(e) => { setFrom(e.target.value); setReportMap({}); }}
          style={{ ...S.input, padding: "6px 10px", fontSize: 12, flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: 12, color: C.inkSoft }}>~</span>
        <input type="date" max={today} value={to} onChange={(e) => { setTo(e.target.value); setReportMap({}); }}
          style={{ ...S.input, padding: "6px 10px", fontSize: 12, flex: 1, minWidth: 120 }} />
      </div>

      {/* 직원 리스트 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visibleWorkers.map((w) => {
          const isOpen = openId === w.id;
          const report = reportMap[w.id];

          return (
            <div key={w.id} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              <div
                style={{ padding: "10px 14px", display: "flex", alignItems: "center", cursor: "pointer", gap: 10 }}
                onClick={() => toggle(w)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{w.name}</span>
                  <span style={{ fontSize: 12, color: C.inkSoft, marginLeft: 8 }}>
                    {[w.corp, w.division, w.team].filter(Boolean).join(" · ")}
                    {w.job_title && <span style={{ marginLeft: 6 }}>| {w.job_title}</span>}
                  </span>
                </div>
                {isOpen && report && (
                  <div style={{ display: "flex", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
                    <KpiBadge label="지각" v={report.kpi.lateCount} color={C.amber} />
                    <KpiBadge label="출근누락" v={report.kpi.missingIn} color={C.seal} />
                    <KpiBadge label="퇴근누락" v={report.kpi.missingOut} color={C.seal} />
                    <KpiBadge label="노트누락" v={report.kpi.missingNote} color={C.blue} />
                  </div>
                )}
                <span style={{ fontSize: 13, color: C.inkSoft, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.line}` }}>
                  {loadingId === w.id && <div style={S.empty}>불러오는 중…</div>}
                  {report && report.days.length === 0 && <div style={S.empty}>이 기간에 근무일이 없습니다.</div>}
                  {report && report.days.map((day, i) => (
                    <DayRow key={i} day={day}
                      wpLat={report.user?.wp_lat} wpLng={report.user?.wp_lng}
                      onLeaveChange={(d, t) => handleLeave(w, d, t)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visibleWorkers.length === 0 && <div style={S.empty}>해당 조건의 직원이 없습니다.</div>}
    </div>
  );
}

function KpiBadge({ label, v, color }) {
  return (
    <span style={{ color: v > 0 ? color : C.inkSoft, fontWeight: v > 0 ? 700 : 400 }}>
      {label} {v}
    </span>
  );
}

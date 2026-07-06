import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

const COL = {
  black: "#3a3a3a", gray: "#787878", lgray: "#eeeeee",
  blue: "#2f6d8f", red: "#cb6156", lred: "#fef5f5", white: "#ffffff",
  amber: "#b9820f", green: "#3E7C5A", detailBg: "#f5f6f8",
};

function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return isMobile;
}

function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); }
const pad2 = (n) => String(n).padStart(2, "0");
function fmtTime(t) { if (!t) return "—"; return new Date(t).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }); }
function fmtDist(m) { if (m == null) return null; return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`; }
function mapsUrl(lat, lng) { return `https://maps.google.com/?q=${lat},${lng}`; }
function openMap(lat, lng) { if (lat != null && lng != null) window.open(mapsUrl(lat, lng), "_blank", "noopener"); }
function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}

// leave_type 파싱/조합
function parseLt(lt) {
  if (!lt) return { primary: null, noteOn: false };
  if (lt === "노트") return { primary: null, noteOn: true };
  const hasNote = lt.endsWith("+노트");
  return { primary: hasNote ? lt.slice(0, -"+노트".length) : lt, noteOn: hasNote };
}
function buildLt(primary, noteOn) {
  if (!primary && !noteOn) return null;
  if (!primary) return "노트";
  return noteOn ? primary + "+노트" : primary;
}

// 전체현황과 동일한 느낌표 아이콘
function WarnIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ verticalAlign: "middle", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill={COL.red} />
      <rect x="11" y="6" width="2" height="8" rx="1" fill="#fff" />
      <rect x="11" y="16" width="2" height="2" rx="1" fill="#fff" />
    </svg>
  );
}
function CheckIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ verticalAlign: "middle", flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill={COL.green} />
      <path d="M7 12.5l3.2 3.2L17 8.5" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 시간 텍스트 (좌표 있으면 클릭 시 지도)
function TimeText({ time, lat, lng, color, bold }) {
  const clickable = lat != null && lng != null;
  return (
    <span
      onClick={clickable ? (e) => { e.stopPropagation(); openMap(lat, lng); } : undefined}
      style={{
        color: color || COL.black, fontVariantNumeric: "tabular-nums", fontWeight: bold ? 700 : 400,
        cursor: clickable ? "pointer" : "default", textDecoration: clickable ? "underline" : "none", textUnderlineOffset: 2,
      }}
    >{fmtTime(time)}</span>
  );
}

// 출퇴근지 + 거리 배지 (근무노트로 다르게 기입 시 '?' 배지)
function PlaceDist({ note, workplaceName, dist }) {
  const noted = note && note.trim();
  const place = noted || workplaceName || "";
  const useNote = noted && noted !== workplaceName;
  const badge = useNote
    ? { text: "?", bg: COL.lgray, fg: COL.gray }
    : dist != null
      ? { text: fmtDist(dist), bg: dist > 200 ? "#f6dcd8" : "#dcece2", fg: dist > 200 ? COL.red : COL.green }
      : null;
  return (
    <>
      {place && <span style={{ color: COL.gray }}>{place}</span>}
      {badge && (
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: badge.bg, color: badge.fg, flexShrink: 0 }}>
          {badge.text}
        </span>
      )}
    </>
  );
}

// 랜덤확인 3개 표시
function RandomChecks({ checks }) {
  if (!checks?.length) return <span style={{ color: COL.gray, fontSize: 12 }}>랜덤확인 없음</span>;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      {checks.map((rc, i) => {
        const done = !!rc.submitted_time;
        const ok = done && rc.is_within_radius;
        const missed = !done && !rc.skipped && (Date.now() - new Date(rc.scheduled_time).getTime() > 5 * 60 * 1000);
        const fail = (done && !ok) || missed;
        const t = rc.submitted_time || rc.scheduled_time;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {ok ? <CheckIcon /> : fail ? <WarnIcon /> : <span style={{ color: COL.gray }}>⏳</span>}
            <TimeText time={t} lat={rc.lat} lng={rc.lng} color={fail ? COL.red : COL.black} />
          </span>
        );
      })}
    </div>
  );
}

function DayRow({ day, workplaceName, isMobile, onLeaveChange }) {
  const [open, setOpen] = useState(false);
  const [leavePopup, setLeavePopup] = useState(false);
  const dow = dayOfWeek(day.date);
  const isWeekend = dow === "토" || dow === "일";
  const isAlert = day.missing || day.isLate || day.noOut || day.noNote;
  const { primary: ltP, noteOn: ltN } = parseLt(day.leaveType);
  const isLeaveFull = day.leaveType === "연차" || ltP === "출퇴근";
  const rowBg = isLeaveFull ? "#fff" : isAlert ? COL.lred : "#fff";

  const popup = leavePopup && onLeaveChange && (
    <LeavePopup day={day} onSelect={(t) => onLeaveChange(day, t)} onClose={() => setLeavePopup(false)} />
  );
  const leaveBtn = onLeaveChange && (
    <button style={{ ...S.miniBtn, marginLeft: 0, fontSize: 11, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); setLeavePopup(true); }}>인정 ▾</button>
  );

  const DateCell = (
    <div style={{ width: 42, flexShrink: 0, textAlign: "center", lineHeight: 1.3 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: isAlert || isWeekend ? COL.red : COL.black }}>{day.date.slice(5)}</div>
      <div style={{ fontSize: 11, color: isAlert || isWeekend ? COL.red : COL.gray }}>{dow}</div>
    </div>
  );

  const Divider = <span style={{ width: 1, alignSelf: "stretch", background: C.lineAdmin, flexShrink: 0 }} />;

  const hasOutingsOrNote = (day.outings && day.outings.length) || day.noteToday || day.timeChangeReason;

  // 연차 / 출퇴근 인정 전체
  if (isLeaveFull) {
    return (
      <>{popup}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${C.lineAdmin}` }}>
          {DateCell}
          <span style={{ ...S.badge, background: COL.blue === "#2f6d8f" ? "#dce9f0" : C.blueSoft, color: COL.blue, fontSize: 12 }}>
            {day.leaveType === "연차" ? "연차" : "출퇴근 인정"}
          </span>
          {ltN && <span style={{ ...S.badge, background: "#dce9f0", color: COL.blue, fontSize: 12 }}>노트 인정</span>}
          <div style={{ marginLeft: "auto" }}>{leaveBtn}</div>
        </div>
      </>
    );
  }

  // 출근 누락 (기록 없음)
  if (day.missing) {
    return (
      <>{popup}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: `1px solid ${C.lineAdmin}`, background: COL.lred }}>
          {DateCell}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COL.red, fontWeight: 700, fontSize: 13 }}>
            <WarnIcon /> 출근 누락
          </span>
          <div style={{ marginLeft: "auto" }}>{leaveBtn}</div>
        </div>
      </>
    );
  }

  // 시계 구간
  const clock = (
    <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", minWidth: 0 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <TimeText time={day.checkIn?.time} lat={day.checkIn?.lat} lng={day.checkIn?.lng} color={day.isLate ? COL.red : COL.black} bold />
        <PlaceDist note={day.checkIn?.note} workplaceName={workplaceName} dist={day.checkIn?.distanceM} />
      </span>
      {day.checkOut ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <TimeText time={day.checkOut.time} lat={day.checkOut.lat} lng={day.checkOut.lng} bold />
          <PlaceDist note={day.checkOut.note} workplaceName={workplaceName} dist={day.checkOut.distanceM} />
        </span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: COL.red, fontWeight: 700 }}><WarnIcon /> 퇴근 누락</span>
      )}
    </div>
  );

  const outN = day.outings?.length || 0;
  const tail = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <span style={{ color: COL.amber, fontWeight: 700 }}>외근 {outN}</span>
      {day.noteToday && <span style={{ color: COL.blue, fontWeight: 700 }}>근무노트</span>}
      {leaveBtn}
      {hasOutingsOrNote && <span style={{ color: COL.gray, fontSize: 12 }}>{open ? "▲" : "▼"}</span>}
    </div>
  );

  return (
    <>{popup}
      <div style={{ borderBottom: `1px solid ${C.lineAdmin}`, background: rowBg }}>
        <div
          style={{ padding: "9px 14px", cursor: hasOutingsOrNote ? "pointer" : "default", fontSize: 13 }}
          onClick={() => hasOutingsOrNote && setOpen((o) => !o)}
        >
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{DateCell}<div style={{ flex: 1, minWidth: 0 }}>{clock}</div></div>
              <div style={{ paddingLeft: 52 }}><RandomChecks checks={day.randomChecks} /></div>
              <div style={{ paddingLeft: 52 }}>{tail}</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {DateCell}
              {Divider}
              <div style={{ flex: "2 1 260px", minWidth: 0 }}>{clock}</div>
              {Divider}
              <div style={{ flex: "1 1 200px", minWidth: 0 }}><RandomChecks checks={day.randomChecks} /></div>
              {Divider}
              <div style={{ flexShrink: 0 }}>{tail}</div>
            </div>
          )}
        </div>

        {open && hasOutingsOrNote && (
          <div style={{ background: COL.detailBg, padding: "10px 16px 12px 56px", fontSize: 13, display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.lineAdmin}` }}>
            {outN > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span style={{ color: COL.amber, fontWeight: 700, marginRight: 4 }}>외근</span>
                {day.outings.map((o, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && <span style={{ color: C.lineAdmin, margin: "0 4px" }}>|</span>}
                    <TimeText time={o.start_time} lat={o.start_lat} lng={o.start_lng} color={COL.blue} />
                    <span style={{ color: COL.black, fontWeight: 600 }}>{o.destination}</span>
                    {o.reason && <span style={{ color: COL.gray }}>{o.reason}</span>}
                  </span>
                ))}
              </div>
            )}
            {day.noteToday && (
              <div><span style={{ color: COL.blue, fontWeight: 700, marginRight: 8 }}>근무노트</span><span style={{ color: COL.black }}>{day.noteToday}</span></div>
            )}
            {day.timeChangeReason && (
              <div><span style={{ color: COL.gray, fontWeight: 700, marginRight: 8 }}>근무시간변경사유</span><span style={{ color: COL.black }}>{day.timeChangeReason}</span></div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function LeavePopup({ day, onSelect, onClose }) {
  const init = parseLt(day.leaveType);
  const [primary, setPrimary] = useState(init.primary);
  const [noteOn, setNoteOn] = useState(init.noteOn);
  useEffect(() => { const p = parseLt(day.leaveType); setPrimary(p.primary); setNoteOn(p.noteOn); }, [day.leaveType]);

  const OPTIONS = [
    { key: "연차", label: "연차", sub: "하루 전체 인정" },
    { key: "출퇴근", label: "출퇴근 인정", sub: "출퇴근 누락 모두 해소" },
    { key: "출근", label: "출근 인정", sub: "출근 누락·지각 해소" },
    { key: "퇴근", label: "퇴근 인정", sub: "퇴근 누락 해소" },
  ];
  const handlePrimary = (key) => {
    const next = primary === key ? null : key;
    setPrimary(next);
    const keepNote = noteOn && key !== "연차";
    setNoteOn(keepNote);
    onSelect(buildLt(next, keepNote));
  };
  const handleNote = () => { const next = !noteOn; setNoteOn(next); onSelect(buildLt(primary, next)); };
  const btnStyle = (active) => ({
    padding: "11px", borderRadius: 10, border: `1px solid ${active ? COL.green : C.line}`,
    background: active ? C.greenSoft : "#fff", color: active ? COL.green : COL.black,
    fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)", minWidth: 260, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ fontWeight: 800, fontSize: 14, color: COL.black, marginBottom: 14 }}>{day.date.slice(5)} 출퇴근 인정 설정</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OPTIONS.map(({ key, label, sub }) => (
            <button key={key} style={btnStyle(primary === key)} onClick={() => handlePrimary(key)}>
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: primary === key ? COL.green : COL.gray }}>{sub}{primary === key ? " ✓" : ""}</span>
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${C.lineAdmin}`, margin: "2px 0" }} />
          <button style={btnStyle(noteOn)} onClick={handleNote}>
            <span>근무 노트 인정</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: noteOn ? COL.green : COL.gray }}>노트 누락 해소{noteOn ? " ✓" : ""}</span>
          </button>
        </div>
        <button style={{ marginTop: 12, background: "none", border: "none", fontSize: 13, color: COL.gray, cursor: "pointer" }} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

function Kpi({ label, v, color }) {
  if (!v) return null;
  return <span style={{ color, fontWeight: 700, whiteSpace: "nowrap" }}>{label} {v}</span>;
}

export default function AdminIndividual({ filters, isHR }) {
  const isMobile = useIsMobile();
  const today = todayStr();
  const monthRef = useRef(null);
  const [ym, setYm] = useState(() => { const [y, m] = todayStr().split("-").map(Number); return { year: y, month: m }; });
  // 선택 월 → 조회 기간 (해당 월 1일 ~ 말일, 단 이번 달이면 오늘까지)
  const lastDay = new Date(ym.year, ym.month, 0).getDate();
  const from = `${ym.year}-${pad2(ym.month)}-01`;
  const isCurrentMonth = today.slice(0, 7) === `${ym.year}-${pad2(ym.month)}`;
  const to = isCurrentMonth ? today : `${ym.year}-${pad2(ym.month)}-${pad2(lastDay)}`;
  const periodText = `${ym.year}. ${pad2(ym.month)}. 01. ~ ${pad2(ym.month)}. ${pad2(isCurrentMonth ? Number(today.slice(8)) : lastDay)}.`;
  const shiftMonth = (delta) => setYm((p) => { const d = new Date(p.year, p.month - 1 + delta, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; });
  const [workers, setWorkers] = useState([]);
  const [scores, setScores] = useState({});
  const [openId, setOpenId] = useState(null);
  const [reportMap, setReportMap] = useState({});
  const [loadingId, setLoadingId] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setListLoading(true);
    api.getWorkers({}).then((d) => setWorkers(d.workers)).finally(() => setListLoading(false));
  }, []);

  // 기간별 KPI 점수 사전 로드 (관리대상 라벨/헤더 KPI 사전 표시) + 기간 변경 시 펼침·캐시 초기화
  useEffect(() => {
    if (!from || !to) return;
    setReportMap({});
    setOpenId(null);
    api.getReportScores({ from, to }).then((d) => setScores(d.scores || {})).catch(() => setScores({}));
  }, [from, to]);

  const visibleWorkers = workers
    .filter((w) => {
      if (w.role === "admin" || w.role === "hr") return false;
      if (filters.corp && w.corp !== filters.corp) return false;
      if (filters.division && w.division !== filters.division) return false;
      if (filters.team && w.team !== filters.team) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  // 법인 → 본부 → 팀 그룹화 (등장 순서 유지)
  const groups = [];
  const gIndex = {};
  for (const w of visibleWorkers) {
    const corp = w.corp || "미지정";
    const div = w.division || "미지정";
    const team = w.team || "미지정";
    const ck = corp;
    if (!(ck in gIndex)) { gIndex[ck] = { name: corp, divs: [], di: {} }; groups.push(gIndex[ck]); }
    const g = gIndex[ck];
    if (!(div in g.di)) { g.di[div] = { name: div, teams: [], ti: {} }; g.divs.push(g.di[div]); }
    const dv = g.di[div];
    if (!(team in dv.ti)) { dv.ti[team] = { name: team, workers: [] }; dv.teams.push(dv.ti[team]); }
    dv.ti[team].workers.push(w);
  }

  const loadReport = async (w) => {
    setLoadingId(w.id);
    try {
      const r = await api.getIndividualReport({ userId: w.id, from, to });
      setReportMap((m) => ({ ...m, [w.id]: { ...r, from, to } }));
    } catch (e) { setMsg(e.message); }
    finally { setLoadingId(null); }
  };

  const toggle = async (w) => {
    if (openId === w.id) { setOpenId(null); return; }
    setOpenId(w.id);
    if (reportMap[w.id]?.from === from && reportMap[w.id]?.to === to) return;
    loadReport(w);
  };

  const handleLeave = async (worker, day, leaveType) => {
    try {
      await api.setLeaveDday({ userId: worker.id, date: day.date, leaveType });
      setMsg(leaveType ? `${day.date} ${leaveType} 인정 처리 완료` : `${day.date} 인정 설정 취소`);
      const r = await api.getIndividualReport({ userId: worker.id, from, to });
      setReportMap((m) => ({ ...m, [worker.id]: { ...r, from, to } }));
      api.getReportScores({ from, to }).then((d) => setScores(d.scores || {})).catch(() => {});
    } catch (e) { setMsg(e.message); }
  };

  if (listLoading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      {msg && <div style={{ ...S.busy, marginBottom: 10 }}>{msg}</div>}

      {/* 기간 설정 — 전체현황과 동일한 월 선택기 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 400, color: COL.black, fontSize: isMobile ? 14 : 16 }}>조회 기간</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid #bb8414`, borderRadius: 8, padding: "0 10px", height: 40, boxSizing: "border-box", background: "#fff", position: "relative" }}>
          <button onClick={() => (monthRef.current?.showPicker ? monthRef.current.showPicker() : monthRef.current?.focus())} title="연월 선택" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={COL.black} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/></svg>
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 400, color: COL.black, fontSize: isMobile ? 13 : 15 }}>{periodText}</span>
          <input ref={monthRef} type="month" max={today.slice(0, 7)} value={`${ym.year}-${pad2(ym.month)}`}
            onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y && m) setYm({ year: y, month: m }); }}
            style={{ width: 1, height: 1, opacity: 0, position: "absolute", left: 8, bottom: 0, pointerEvents: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 2 }}>
            <button onClick={() => shiftMonth(1)} aria-label="다음 달" style={{ border: "none", background: "transparent", cursor: "pointer", color: COL.black, lineHeight: 0.8, fontSize: 11 }}>▲</button>
            <button onClick={() => shiftMonth(-1)} aria-label="지난 달" style={{ border: "none", background: "transparent", cursor: "pointer", color: COL.black, lineHeight: 0.8, fontSize: 11 }}>▼</button>
          </div>
        </div>
      </div>

      {/* 법인 → 본부 → 팀 그룹 */}
      {groups.map((g) => (
        <div key={g.name} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 4, height: 18, background: COL.blue, borderRadius: 2 }} />
            <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: COL.blue }}>{g.name}</span>
          </div>
          {g.divs.map((dv) => (
            <div key={dv.name} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: COL.black, margin: "0 0 6px 12px" }}>{dv.name}</div>
              {dv.teams.map((tm) => (
                <div key={tm.name} style={{ marginBottom: 8, marginLeft: 24 }}>
                  <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 600, color: COL.gray, margin: "0 0 6px" }}>{tm.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tm.workers.map((w) => {
                      const isOpen = openId === w.id;
                      const report = reportMap[w.id];
                      const sc = scores[w.id];
                      const over = sc && sc.score >= 5;
                      return (
                        <div key={w.id} style={{ border: `1px solid ${C.lineAdmin}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                          <div style={{ padding: isMobile ? "11px 14px" : "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }} onClick={() => toggle(w)}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 800, fontSize: isMobile ? 15 : 18, color: COL.black }}>{w.name}</span>
                              {over && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: COL.red, background: COL.lred, padding: "2px 8px", borderRadius: 10 }}>관리대상</span>}
                              <span style={{ fontSize: isMobile ? 12 : 15, color: COL.gray, marginLeft: 8 }}>
                                {[w.position, [w.corp, w.division, w.team].filter(Boolean).join(" · ")].filter(Boolean).join(" / ")}
                              </span>
                            </div>
                            {isOpen && sc && !isMobile && (
                              <div style={{ display: "flex", gap: 12, fontSize: 15, flexShrink: 0 }}>
                                <Kpi label="지각" v={sc.lateCount} color={COL.amber} />
                                <Kpi label="출근누락" v={sc.missingIn} color={COL.red} />
                                <Kpi label="퇴근누락" v={sc.missingOut} color={COL.red} />
                                <Kpi label="노트누락" v={sc.missingNote} color={COL.blue} />
                              </div>
                            )}
                            {isOpen && (
                              <button style={{ ...S.miniBtn, marginLeft: 0, fontSize: 12, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); loadReport(w); }}>↻</button>
                            )}
                            <span style={{ fontSize: 13, color: COL.gray, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                          </div>

                          {isOpen && sc && isMobile && (
                            <div style={{ display: "flex", gap: 12, fontSize: 13, padding: "0 14px 10px", flexWrap: "wrap" }}>
                              <Kpi label="지각" v={sc.lateCount} color={COL.amber} />
                              <Kpi label="출근누락" v={sc.missingIn} color={COL.red} />
                              <Kpi label="퇴근누락" v={sc.missingOut} color={COL.red} />
                              <Kpi label="노트누락" v={sc.missingNote} color={COL.blue} />
                            </div>
                          )}

                          {isOpen && (
                            <div style={{ borderTop: `1px solid ${C.lineAdmin}` }}>
                              {loadingId === w.id && <div style={S.empty}>불러오는 중…</div>}
                              {report && report.days.length === 0 && <div style={S.empty}>이 기간에 근무일이 없습니다.</div>}
                              {report && report.days.map((day, i) => (
                                <DayRow key={i} day={day} workplaceName={w.workplace_name} isMobile={isMobile}
                                  onLeaveChange={isHR ? (d, t) => handleLeave(w, d, t) : undefined} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {visibleWorkers.length === 0 && <div style={S.empty}>해당 조건의 직원이 없습니다.</div>}
    </div>
  );
}

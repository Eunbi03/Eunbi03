import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";

// 유동 근무시간 근로자: 본인 근무 일정(날짜별 출퇴근) 등록/수정/삭제.
// 등록·수정·삭제 범위: 내일(+1) ~ +30일.

const W = {
  bg: "#f4f6f7", card: "#ffffff", ink: "#333333", sub: "#787878",
  blue: "#2f6d8f", green: "#3E7C5A", greenBg: "#DCEBE1", greenLine: "#bfe0cd",
  red: "#cb6156", line: "#e6ebef", border: "#dbe2ea",
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const MIN_D = 1, MAX_D = 30;

const todayKST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const daysBetween = (dateStr) => Math.round((new Date(dateStr + "T00:00:00Z") - new Date(todayKST() + "T00:00:00Z")) / 86400000);
const inRange = (dateStr) => { const d = daysBetween(dateStr); return d >= MIN_D && d <= MAX_D; };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// 한 달 달력 칸(앞쪽 빈칸 포함) 생성
function monthCells(month) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = first.getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(ymd(y, m, d));
  return cells;
}

export default function WorkManageView({ onBack }) {
  const [month, setMonth] = useState(() => todayKST().slice(0, 7));
  const [schedules, setSchedules] = useState([]); // 전체 범위 일정 (내일~+30일 커버)
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("cal"); // cal | add
  const [editTarget, setEditTarget] = useState(null); // {id, work_date, start_time, end_time} | {work_date} (신규 불가 날 안내)
  const [msg, setMsg] = useState("");

  const load = () => {
    setLoading(true);
    const from = todayKST();
    const toD = new Date(from + "T00:00:00Z"); toD.setUTCDate(toD.getUTCDate() + MAX_D);
    api.getMySchedules({ from, to: toD.toISOString().slice(0, 10) })
      .then((d) => setSchedules(d.schedules || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const byDate = {};
  for (const s of schedules) byDate[s.work_date] = s;

  const changeMonth = (delta) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const [my, mm] = month.split("-");

  if (screen === "add") return <AddView onBack={() => setScreen("cal")} existing={byDate} onDone={() => { setScreen("cal"); load(); }} />;

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button style={bk} onClick={onBack}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: W.ink, margin: 0, flex: 1 }}>근무 관리</h2>
        <button style={plusBtn} onClick={() => setScreen("add")} aria-label="근무 추가">＋</button>
      </div>

      <div style={monthNav}>
        <button style={arw} onClick={() => changeMonth(-1)}>‹</button>
        <span style={{ fontWeight: 800, fontSize: 15, color: W.ink }}>{my}년 {parseInt(mm, 10)}월</span>
        <button style={arw} onClick={() => changeMonth(1)}>›</button>
      </div>

      {loading ? <div style={S.empty}>불러오는 중…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {DOW.map((d, i) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, padding: "2px 0", color: i === 0 ? W.red : i === 6 ? W.blue : W.sub }}>{d}</div>
            ))}
            {monthCells(month).map((date, i) => {
              if (!date) return <div key={i} />;
              const dow = new Date(date + "T12:00:00Z").getUTCDay();
              const sc = byDate[date];
              const isToday = date === todayKST();
              const editable = inRange(date);
              return (
                <div key={i}
                  onClick={() => { if (sc) setEditTarget(sc); }}
                  style={{
                    background: sc ? W.greenBg : "#fff", border: `1px solid ${sc ? W.greenLine : "#eef1f4"}`,
                    borderRadius: 8, minHeight: 54, padding: "4px 2px", textAlign: "center",
                    outline: isToday ? `2px solid ${W.blue}` : "none",
                    cursor: sc ? "pointer" : "default", opacity: !sc && !editable && !isToday ? 0.55 : 1,
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: sc ? W.green : (dow === 0 ? W.red : dow === 6 ? W.blue : W.ink) }}>{parseInt(date.slice(8), 10)}</div>
                  {sc && <div style={{ fontSize: 9, color: W.green, fontWeight: 700, lineHeight: 1.3, marginTop: 2 }}>{sc.start_time}<br />~<br />{sc.end_time}</div>}
                  {!sc && isToday && <div style={{ fontSize: 9, color: W.sub, marginTop: 3 }}>오늘</div>}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: W.sub, marginTop: 10, lineHeight: 1.5 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: W.greenBg, border: `1px solid ${W.greenLine}`, borderRadius: 2, verticalAlign: -1 }} /> 근무 등록일 (날짜를 눌러 수정·삭제) · 등록·수정·삭제는 내일~+30일만 가능
          </p>
        </>
      )}

      {editTarget && <EditPopup sc={editTarget} onClose={() => setEditTarget(null)} onDone={() => { setEditTarget(null); load(); }} />}
      {msg && <div style={{ ...S.err, marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

// ── 근무 추가 (날짜 다중선택 + 공통/개별 시간) ──────────────────────────
function AddView({ onBack, existing, onDone }) {
  const [month, setMonth] = useState(() => todayKST().slice(0, 7));
  const [picker, setPicker] = useState(false);
  const [sel, setSel] = useState([]);          // ['YYYY-MM-DD', ...]
  const [commonStart, setCommonStart] = useState("09:00");
  const [commonEnd, setCommonEnd] = useState("18:00");
  const [times, setTimes] = useState({});       // { date: {start, end} }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [my, mm] = month.split("-");
  const changeMonth = (delta) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); };

  const toggle = (date) => {
    if (!inRange(date)) return;
    setSel((prev) => {
      if (prev.includes(date)) { const n = prev.filter((x) => x !== date); setTimes((t) => { const c = { ...t }; delete c[date]; return c; }); return n; }
      setTimes((t) => ({ ...t, [date]: { start: commonStart, end: commonEnd } }));
      return [...prev, date].sort();
    });
  };
  // 공통 시간 변경 → 선택된 모든 날짜에 반영
  const applyCommon = (start, end) => {
    setCommonStart(start); setCommonEnd(end);
    setTimes((t) => { const c = {}; for (const d of sel) c[d] = { start, end }; return c; });
  };

  const save = async () => {
    if (!sel.length) { setMsg("날짜를 선택해주세요."); return; }
    for (const d of sel) { const t = times[d]; if (t.end <= t.start) { setMsg(`${d.slice(5)} 퇴근 시간이 출근보다 늦어야 합니다.`); return; } }
    setBusy(true); setMsg("");
    try {
      const payload = sel.map((d) => ({ workDate: d, startTime: times[d].start, endTime: times[d].end }));
      const r = await api.bulkCreateSchedules(payload);
      if (r.failed?.length) { setMsg(`${r.success}건 등록, ${r.failed.length}건 실패: ${r.failed.map((f) => `${f.workDate}(${f.reason})`).join(", ")}`); setBusy(false); return; }
      onDone();
    } catch (e) { setMsg(e.message); setBusy(false); }
  };

  const inp = { ...S.input };
  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button style={bk} onClick={onBack}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: W.ink, margin: 0, flex: 1 }}>근무 추가</h2>
      </div>

      <div style={{ ...S.formCard, marginTop: 0 }}>
        <label style={{ ...S.fieldLabel, display: "block" }}>날짜 선택 (복수)</label>
        <div style={{ ...inp, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setPicker(true)}>
          <span style={{ color: sel.length ? W.ink : W.sub }}>{sel.length ? `${sel.map((d) => d.slice(5).replace("-", "/")).join(", ")} (${sel.length}일)` : "달력에서 날짜 선택"}</span>
          <span style={{ color: W.sub }}>달력 ▾</span>
        </div>

        <label style={{ ...S.fieldLabel, display: "block", marginTop: 12 }}>공통 출근 / 퇴근</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="time" style={inp} value={commonStart} onChange={(e) => applyCommon(e.target.value, commonEnd)} />
          <input type="time" style={inp} value={commonEnd} onChange={(e) => applyCommon(commonStart, e.target.value)} />
        </div>

        {sel.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label style={{ ...S.fieldLabel, display: "block" }}>날짜별 시간 (개별 수정 가능)</label>
            {sel.map((d) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${W.line}` }}>
                <span style={{ width: 54, fontSize: 13, fontWeight: 700, color: W.ink }}>{d.slice(5).replace("-", "/")}</span>
                <input type="time" style={{ ...inp, flex: 1, padding: "7px 8px" }} value={times[d]?.start || ""} onChange={(e) => setTimes((t) => ({ ...t, [d]: { ...t[d], start: e.target.value } }))} />
                <span style={{ color: W.sub }}>~</span>
                <input type="time" style={{ ...inp, flex: 1, padding: "7px 8px" }} value={times[d]?.end || ""} onChange={(e) => setTimes((t) => ({ ...t, [d]: { ...t[d], end: e.target.value } }))} />
              </div>
            ))}
          </div>
        )}

        {msg && <div style={{ ...S.err, marginTop: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={S.subGhost} onClick={onBack} disabled={busy}>취소</button>
          <button style={{ ...S.subPrimary, background: W.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "등록 중…" : `${sel.length || ""}건 등록`}</button>
        </div>
      </div>

      {picker && (
        <div style={overlay} onClick={() => setPicker(false)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, width: "100%", maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={monthNav}>
              <button style={arw} onClick={() => changeMonth(-1)}>‹</button>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{my}년 {parseInt(mm, 10)}월</span>
              <button style={arw} onClick={() => changeMonth(1)}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
              {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? W.red : i === 6 ? W.blue : W.sub }}>{d}</div>)}
              {monthCells(month).map((date, i) => {
                if (!date) return <div key={i} />;
                const dow = new Date(date + "T12:00:00Z").getUTCDay();
                const ok = inRange(date);
                const on = sel.includes(date);
                const already = !!existing[date];
                return (
                  <div key={i} onClick={() => ok && toggle(date)}
                    style={{
                      aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      fontSize: 12, borderRadius: 7, cursor: ok ? "pointer" : "not-allowed",
                      background: on ? W.blue : ok ? "#f4f6f8" : "#fafbfc",
                      color: on ? "#fff" : ok ? (dow === 0 ? W.red : dow === 6 ? W.blue : W.ink) : "#cfd6de",
                      fontWeight: on ? 800 : 400,
                    }}>
                    {parseInt(date.slice(8), 10)}
                    {already && !on && <span style={{ width: 4, height: 4, borderRadius: "50%", background: W.green, marginTop: 2 }} />}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: W.sub, margin: "8px 0 0" }}>초록 점 = 이미 등록된 날(선택 시 덮어씀)</p>
            <button style={{ ...S.subPrimary, background: W.blue, marginTop: 12 }} onClick={() => setPicker(false)}>선택 완료 ({sel.length}일)</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 날짜 수정/삭제 팝업 ────────────────────────────────────────────────
function EditPopup({ sc, onClose, onDone }) {
  const [start, setStart] = useState(sc.start_time);
  const [end, setEnd] = useState(sc.end_time);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const editable = inRange(sc.work_date);
  const dow = DOW[new Date(sc.work_date + "T12:00:00Z").getUTCDay()];

  const save = async () => {
    if (end <= start) { setMsg("퇴근 시간이 출근 시간보다 늦어야 합니다."); return; }
    setBusy(true); setMsg("");
    try { await api.updateSchedule(sc.id, { startTime: start, endTime: end }); onDone(); }
    catch (e) { setMsg(e.message); setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(`${sc.work_date.slice(5).replace("-", "/")} 근무 일정을 삭제하시겠습니까?`)) return;
    setBusy(true); setMsg("");
    try { await api.deleteSchedule(sc.id); onDone(); }
    catch (e) { setMsg(e.message); setBusy(false); }
  };

  const inp = { ...S.input };
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...S.formCard, margin: 0, width: "100%", maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <p style={{ ...S.formTitle, margin: "0 0 10px" }}>{sc.work_date.slice(5).replace("-", "/")} ({dow}) 근무</p>
        {editable ? (
          <>
            <label style={{ ...S.fieldLabel, display: "block" }}>출근 / 퇴근</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="time" style={inp} value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="time" style={inp} value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            {msg && <div style={{ ...S.err, marginTop: 8 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={{ ...S.subGhost, color: W.red, borderColor: "#e8c4bf" }} onClick={del} disabled={busy}>삭제</button>
              <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
              <button style={{ ...S.subPrimary, background: W.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "처리 중…" : "저장"}</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: W.ink }}>{start} ~ {end}</div>
            <div style={{ fontSize: 12, color: W.sub, marginTop: 8 }}>지난·당일 일정은 수정·삭제할 수 없습니다.</div>
            <button style={{ ...S.subGhost, marginTop: 12 }} onClick={onClose}>닫기</button>
          </>
        )}
      </div>
    </div>
  );
}

const bk = { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: W.ink, padding: "0 4px 0 0", lineHeight: 1 };
const plusBtn = { background: "none", border: "none", color: W.blue, fontSize: 28, fontWeight: 800, lineHeight: 1, cursor: "pointer", padding: "0 2px" };
const monthNav = { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, background: "#fff", borderRadius: 12, padding: "9px 0", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const arw = { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: W.ink, padding: "0 8px", lineHeight: 1 };
const overlay = { position: "fixed", inset: 0, background: "rgba(30,36,48,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 };

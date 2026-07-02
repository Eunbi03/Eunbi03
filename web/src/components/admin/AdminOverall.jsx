import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";
import { downloadAttendanceRegister } from "../../utils/excelReport.js";

const COL = {
  black: "#3a3a3a", gray: "#787878", lgray: "#eeeeee",
  blue: "#2f6d8f", red: "#cb6156", lred: "#fff0f0", white: "#ffffff",
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const HEADER_BG = "#d8e8f0"; // 가로/세로 헤더 배경
const ROW_H = 44;            // 헤더와 데이터 행 높이 동일

function useIsMobile(breakpoint = 640) {
  const [m, setM] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => { const h = () => setM(window.innerWidth < breakpoint); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [breakpoint]);
  return m;
}

const pad = (n) => String(n).padStart(2, "0");

function Cell({ cell, isMobile, over, height }) {
  const fs = isMobile ? 10 : 12;
  const base = {
    padding: "3px 2px", textAlign: "center", fontSize: fs, lineHeight: 1.25,
    borderRight: `1px solid ${COL.lgray}`, verticalAlign: "middle", minWidth: isMobile ? 34 : 42, height,
    ...(over ? { borderTop: `2px solid ${COL.white}`, borderBottom: `2px solid ${COL.white}` } : {}), // 관리대상 여백
  };
  if (!cell || cell.off) return <td style={{ ...base, color: COL.gray }}>-</td>;
  // 연차만 파란색, 그 외 인정(출근/퇴근/노트 등)은 #3a3a3a 일반
  if (cell.leave) return <td style={{ ...base, color: cell.leave === "연차" ? COL.blue : COL.black, fontWeight: cell.leave === "연차" ? 700 : 400 }}>{cell.leave}</td>;
  const warn = <span style={{ color: COL.red, fontWeight: 800 }}>❗</span>;
  return (
    <td style={{ ...base, boxShadow: cell.noteMiss ? `inset 0 -3px 0 ${COL.red}` : undefined }}>
      <div style={{ color: cell.late ? COL.red : COL.black, fontWeight: cell.late ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
        {cell.missingIn ? warn : (cell.checkIn || "")}
      </div>
      <div style={{ color: COL.black, fontVariantNumeric: "tabular-nums" }}>
        {cell.missingOut ? warn : (cell.checkOut || "")}
      </div>
    </td>
  );
}

export default function AdminOverall({ filters }) {
  const isMobile = useIsMobile();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // 인원 직접 입력
  const [directOn, setDirectOn] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [selected, setSelected] = useState([]); // [{id,name,corp,division,team,workplace_name}]
  const [popup, setPopup] = useState(null);      // 동명이인 후보 목록
  const monthRef = useRef(null);

  const shiftMonth = (delta) => setYm((v) => {
    let m = v.month + delta, y = v.year;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    return { year: y, month: m };
  });

  const load = () => {
    setLoading(true);
    const params = { year: ym.year, month: ym.month, page };
    if (selected.length) params.userIds = selected.map((s) => s.id).join(",");
    else { if (filters.corp) params.corp = filters.corp; if (filters.division) params.division = filters.division; if (filters.team) params.team = filters.team; if (filters.position) params.position = filters.position; }
    api.getMonthlyOverview(params).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ym, page, filters, selected]);
  useEffect(() => { setPage(1); }, [ym, filters, selected]);

  const doSearch = async () => {
    const name = nameInput.trim(); if (!name) return;
    try {
      const d = await api.searchWorkers(name);
      const found = d.workers || [];
      if (found.length === 0) { alert("해당 이름의 직원을 찾을 수 없습니다."); return; }
      if (found.length === 1) { addSelected(found[0]); setNameInput(""); return; }
      setPopup(found);
    } catch (e) { alert(e.message); }
  };
  const addSelected = (w) => { setSelected((s) => (s.some((x) => x.id === w.id) ? s : [...s, w])); setPopup(null); setNameInput(""); };
  const removeSelected = (id) => setSelected((s) => s.filter((x) => x.id !== id));

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = { year: ym.year, month: ym.month, full: 1 };
      if (selected.length) params.userIds = selected.map((s) => s.id).join(",");
      else { if (filters.corp) params.corp = filters.corp; if (filters.division) params.division = filters.division; if (filters.team) params.team = filters.team; if (filters.position) params.position = filters.position; }
      const d = await api.getMonthlyOverview(params);
      if (!d.workers.length) { alert("다운로드할 직원이 없습니다."); return; }
      await downloadAttendanceRegister(d);
    } catch (e) { alert("다운로드 실패: " + e.message); }
    finally { setDownloading(false); }
  };

  const dim = data?.daysInMonth || new Date(ym.year, ym.month, 0).getDate();
  const periodText = `${ym.year}. ${pad(ym.month)}. 01. ~ ${pad(ym.month)}. ${pad(dim)}.`;

  return (
    <div>
      {/* 기간 + 인원 직접 입력 + 다운로드 */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontWeight: 400, color: COL.black, fontSize: isMobile ? 14 : 16 }}>조회 기간</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid #bb8414`, borderRadius: 8, padding: "0 10px", height: 40, boxSizing: "border-box", background: "#fff", position: "relative" }}>
          <button onClick={() => (monthRef.current?.showPicker ? monthRef.current.showPicker() : monthRef.current?.focus())} title="연월 선택" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={COL.black} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4.5" width="18" height="17" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/></svg>
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 400, color: COL.black, fontSize: isMobile ? 13 : 15 }}>{periodText}</span>
          <input ref={monthRef} type="month" value={`${ym.year}-${pad(ym.month)}`}
            onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y && m) setYm({ year: y, month: m }); }}
            style={{ width: 1, height: 1, opacity: 0, position: "absolute", left: 8, bottom: 0, pointerEvents: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 2 }}>
            <button onClick={() => shiftMonth(1)} aria-label="다음 달" style={{ border: "none", background: "transparent", cursor: "pointer", color: COL.black, lineHeight: 0.8, fontSize: 11 }}>▲</button>
            <button onClick={() => shiftMonth(-1)} aria-label="지난 달" style={{ border: "none", background: "transparent", cursor: "pointer", color: COL.black, lineHeight: 0.8, fontSize: 11 }}>▼</button>
          </div>
        </div>

        <div onClick={() => setDirectOn(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", border: `1px solid ${directOn ? COL.blue : COL.black}`, borderRadius: 8, padding: "0 10px", minHeight: 40, boxSizing: "border-box", background: directOn ? "#fff" : COL.lgray, flex: "1 1 220px", cursor: "text" }}>
          {selected.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: COL.blue, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 12 }}>
              {s.name}<button onClick={(e) => { e.stopPropagation(); removeSelected(s.id); }} style={{ border: "none", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
          <input value={nameInput} placeholder={selected.length ? "" : "인원 직접 입력"}
            onFocus={() => setDirectOn(true)}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            style={{ flex: 1, minWidth: 80, border: "none", outline: "none", background: "transparent", color: directOn ? COL.black : COL.gray, fontSize: 14 }} />
          {directOn && (selected.length > 0 || nameInput) && (
            <button onClick={(e) => { e.stopPropagation(); setSelected([]); setNameInput(""); setDirectOn(false); }} style={{ border: "none", background: "transparent", color: COL.gray, cursor: "pointer", fontSize: 13 }}>초기화</button>
          )}
        </div>

        <button onClick={handleDownload} disabled={downloading}
          style={{ border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 700, background: COL.blue, color: "#fff", cursor: "pointer", opacity: downloading ? 0.6 : 1 }}>{downloading ? "생성 중…" : "다운로드"}</button>
      </div>

      {/* 동명이인 팝업 */}
      {popup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={() => setPopup(null)}>
          <div style={{ ...S.loginCard, maxWidth: 420, width: "100%", margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <p style={S.h1}>동명이인 선택</p>
            <p style={{ fontSize: 13, color: C.inkSoft }}>같은 이름의 직원이 여러 명입니다. 선택해주세요.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {popup.map((w) => (
                <button key={w.id} onClick={() => addSelected(w)}
                  style={{ textAlign: "left", border: `1px solid ${C.lineAdmin}`, background: "#fff", borderRadius: 10, padding: "10px 14px", cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, color: C.ink }}>{w.name}</div>
                  <div style={{ fontSize: 12, color: C.inkSoft }}>{[w.corp, w.division, w.team, w.workplace_name].filter(Boolean).join(" · ")}</div>
                </button>
              ))}
            </div>
            <button style={{ ...S.subGhost, width: "100%", marginTop: 8 }} onClick={() => setPopup(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 그리드 */}
      {loading ? <div style={S.empty}>불러오는 중…</div>
        : !data || data.workers.length === 0 ? <div style={S.empty}>조회된 직원이 없습니다.</div>
        : (
          <>
            <div style={{ overflowX: "auto", border: `1px solid ${COL.lgray}`, borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", background: "#fff" }}>
                <thead>
                  <tr style={{ height: ROW_H }}>
                    <th style={{ position: "sticky", left: 0, zIndex: 2, background: HEADER_BG, padding: "6px 8px", fontSize: isMobile ? 11 : 13, color: COL.black, borderRight: `1px solid ${COL.gray}`, minWidth: isMobile ? 54 : 70 }}>구분</th>
                    {Array.from({ length: dim }, (_, i) => {
                      const d = i + 1; const dow = data.dow[i];
                      const isRed = dow === 0 || dow === 6 || !!data.holidays[`${ym.year}-${pad(ym.month)}-${pad(d)}`];
                      return (
                        <th key={d} style={{ padding: "4px 2px", fontSize: isMobile ? 10 : 12, borderRight: `1px solid ${COL.lgray}`, color: isRed ? COL.red : COL.black, background: HEADER_BG }}>
                          <div>{d}</div><div style={{ fontWeight: 400 }}>{DOW[dow]}</div>
                        </th>
                      );
                    })}
                    <th colSpan={2} style={{ padding: "4px 8px", fontSize: isMobile ? 11 : 13, color: COL.black, background: HEADER_BG, borderLeft: `1px solid ${COL.gray}` }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map((w) => (
                    <tr key={w.id} style={{ height: ROW_H, background: w.over ? COL.lred : "#fff", borderTop: `1px solid ${COL.lgray}` }}>
                      <td style={{ position: "sticky", left: 0, zIndex: 1, background: HEADER_BG, padding: "4px 8px", textAlign: "center", fontSize: isMobile ? 11 : 13, fontWeight: 700, color: COL.black, borderRight: `1px solid ${COL.gray}`, whiteSpace: "nowrap" }}>{w.name}</td>
                      {w.days.map((cell, i) => <Cell key={i} cell={cell} isMobile={isMobile} over={w.over} height={ROW_H} />)}
                      <td style={{ padding: "4px 6px", textAlign: "center", fontSize: isMobile ? 11 : 13, fontWeight: 800, color: COL.black, borderLeft: `1px solid ${COL.gray}`, fontVariantNumeric: "tabular-nums", ...(w.over ? { borderTop: `2px solid ${COL.white}`, borderBottom: `2px solid ${COL.white}` } : {}) }}>
                        <span style={{ color: w.over ? COL.red : COL.black }}>{w.lateMissing}</span>
                        <span style={{ color: COL.black }}>/{w.workedDays}</span>
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "center", fontSize: isMobile ? 11 : 13, fontWeight: 700, color: w.over ? COL.red : COL.black, fontVariantNumeric: "tabular-nums", ...(w.over ? { borderTop: `2px solid ${COL.white}`, borderBottom: `2px solid ${COL.white}`, borderRight: `2px solid ${COL.white}` } : {}) }}>
                        {w.noteMissing || "-"}
                      </td>
                    </tr>
                  ))}
                  {/* 세로 합계: 해당일 출근 인원 */}
                  <tr style={{ height: ROW_H, background: COL.lgray, borderTop: `1px solid ${COL.lgray}` }}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: COL.lgray, padding: "4px 8px", textAlign: "center", fontSize: isMobile ? 11 : 13, fontWeight: 800, color: COL.black, borderRight: `1px solid ${COL.gray}` }}>합계</td>
                    {data.dayTotals.map((n, i) => (
                      <td key={i} style={{ padding: "4px 2px", textAlign: "center", fontSize: isMobile ? 11 : 13, fontWeight: 700, color: COL.black, borderRight: `1px solid ${COL.lgray}`, fontVariantNumeric: "tabular-nums" }}>{n || "-"}</td>
                    ))}
                    <td colSpan={2} style={{ padding: "4px 6px", textAlign: "center", fontSize: isMobile ? 11 : 13, fontWeight: 800, color: COL.black, borderLeft: `1px solid ${COL.gray}`, fontVariantNumeric: "tabular-nums" }}>
                      {data.dayTotals.reduce((a, b) => a + b, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {data.pagination.pages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 16 }}>
                <button style={{ ...S.miniBtn, color: C.inkSoft }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                {Array.from({ length: data.pagination.pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 15, fontWeight: n === page ? 800 : 400, color: n === page ? COL.blue : C.inkSoft, minWidth: 24 }}>{n}</button>
                ))}
                <button style={{ ...S.miniBtn, color: C.inkSoft }} disabled={page >= data.pagination.pages} onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}>›</button>
              </div>
            )}
          </>
        )}
    </div>
  );
}

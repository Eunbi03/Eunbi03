import { useState, useEffect, useCallback } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const monthAgoStr = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); };

// 작업별 배지 색
const actionColor = (a) => {
  if (a === "삭제" || a === "인정해제") return { c: C.seal, bg: C.sealSoft };
  if (a === "추가" || a === "초대") return { c: C.green, bg: C.greenSoft };
  if (a === "발송") return { c: C.blue, bg: C.blueSoft };
  return { c: C.amber, bg: C.amberSoft }; // 수정/인정/비번초기화/기기변경/승인 등
};

export default function AdminLog() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const [admin, setAdmin] = useState("");
  const [worker, setWorker] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (admin.trim()) params.admin = admin.trim();
      if (worker.trim()) params.worker = worker.trim();
      const d = await api.getAuditLogs(params);
      setLogs(d.logs || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [from, to, admin, worker]);

  useEffect(() => { load(); }, []); // 최초 1회

  const inp = { ...S.input, padding: "8px 10px", fontSize: 13 };
  const th = { textAlign: "left", fontSize: 12, fontWeight: 800, color: C.inkSoft, padding: "8px 10px", borderBottom: `2px solid ${C.lineAdmin}`, whiteSpace: "nowrap" };
  const td = { fontSize: 13, color: C.ink, padding: "9px 10px", borderBottom: `1px solid ${C.lineAdmin}`, verticalAlign: "top" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>작업 기록</p>
        <span style={{ fontSize: 12, color: C.inkSoft }}>기록은 1년간 보관됩니다.</span>
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700 }}>시작일</label>
          <input type="date" style={inp} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700 }}>종료일</label>
          <input type="date" style={inp} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700 }}>관리자명</label>
          <input style={{ ...inp, width: 130 }} placeholder="관리자 검색" value={admin} onChange={(e) => setAdmin(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <label style={{ fontSize: 11, color: C.inkSoft, fontWeight: 700 }}>근로자명</label>
          <input style={{ ...inp, width: 130 }} placeholder="근로자 검색" value={worker} onChange={(e) => setWorker(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} />
        </div>
        <button style={{ ...S.toolbarBtn, border: "none", background: C.blue, color: "#fff" }} onClick={load} disabled={loading}>
          {loading ? "조회 중…" : "조회"}
        </button>
      </div>

      {err && <div style={{ ...S.busy, color: C.seal, marginBottom: 10 }}>{err}</div>}

      {loading ? (
        <div style={S.empty}>불러오는 중…</div>
      ) : logs.length === 0 ? (
        <div style={S.empty}>해당 조건의 작업 기록이 없습니다.</div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.lineAdmin}`, borderRadius: 12, background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={th}>일시</th>
                <th style={th}>관리자</th>
                <th style={th}>작업</th>
                <th style={th}>구분</th>
                <th style={th}>대상</th>
                <th style={th}>비고</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => {
                const ac = actionColor(l.action);
                return (
                  <tr key={i}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}>{l.at}</td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{l.admin_name || "-"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}><span style={{ fontSize: 11, fontWeight: 800, color: ac.c, background: ac.bg, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{l.action}</span></td>
                    <td style={{ ...td, color: C.inkSoft, whiteSpace: "nowrap" }}>{l.entity}</td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{l.target_name || "-"}</td>
                    <td style={{ ...td, color: C.inkSoft, minWidth: 280, wordBreak: "break-word" }}>{l.detail || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {logs.length >= 1000 && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 8 }}>최근 1000건만 표시됩니다. 기간을 좁혀 조회하세요.</div>}
    </div>
  );
}

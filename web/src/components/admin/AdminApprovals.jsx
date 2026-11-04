import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

const COL = { blue: "#2f6d8f", gray: "#5b6472", green: "#3E7C5A", red: "#cb6156", amber: "#b9820f" };
const STATUS = {
  pending: { t: "대기", bg: "#f0ead0", fg: COL.amber },
  approved: { t: "승인", bg: "#dcece2", fg: COL.green },
  rejected: { t: "반려", bg: "#f6dcd8", fg: COL.red },
};
const fmtDate = (d) => { const x = new Date(d + "T00:00:00"); const w = "일월화수목금토"[x.getDay()]; return `${d.slice(5).replace("-", "/")} (${w})`; };

export default function AdminApprovals() {
  const [tab, setTab] = useState("pending"); // pending | all
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);

  const load = () => { setLoading(true); api.getOvertimeRequests(tab).then((d) => setList(d.requests || [])).catch((e) => setMsg({ text: e.message, ok: false })).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [tab]);

  const decide = async (o, approve) => {
    let reason = null;
    if (!approve) { reason = window.prompt("반려 사유 (선택)", "") ?? ""; }
    setBusy(o.id); setMsg(null);
    try {
      await api.decideOvertime(o.id, approve, reason);
      setMsg({ text: approve ? "승인했습니다." : "반려했습니다.", ok: true });
      load();
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setBusy(""); }
  };

  const tabBtn = (k, label) => (
    <button onClick={() => setTab(k)} style={{ border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 14, fontWeight: tab === k ? 800 : 600, background: tab === k ? COL.blue : "transparent", color: tab === k ? "#fff" : COL.gray, cursor: "pointer" }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: 0 }}>연장 근무 승인 관리</p>
        <div style={{ display: "flex", gap: 4 }}>{tabBtn("pending", "대기")}{tabBtn("all", "전체")}</div>
      </div>
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? COL.green : COL.red, padding: "6px 10px", background: msg.ok ? "#dcece2" : "#f6dcd8", borderRadius: 8, marginBottom: 10 }}>{msg.text}</div>}

      {loading ? <div style={{ textAlign: "center", color: COL.gray, padding: 30 }}>불러오는 중…</div>
        : list.length === 0 ? <div style={{ textAlign: "center", color: COL.gray, padding: 30 }}>{tab === "pending" ? "대기 중인 연장근무 신청이 없습니다." : "연장근무 신청 내역이 없습니다."}</div>
        : list.map((o) => {
          const st = STATUS[o.status] || STATUS.pending;
          const org = [o.corp, o.division, o.team].filter(Boolean).join(" · ");
          return (
            <div key={o.id} style={{ border: `1px solid ${C.lineAdmin}`, borderRadius: 10, padding: "11px 13px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 800, color: C.ink }}>{o.worker_name} <span style={{ fontWeight: 400, color: COL.gray, fontSize: 13 }}>· {o.position || "-"} · {org}</span></div>
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, height: "fit-content", background: st.bg, color: st.fg }}>{st.t}</span>
              </div>
              <div style={{ color: COL.gray, fontSize: 13.5, marginTop: 4 }}>{fmtDate(o.work_date)} · {o.start_time}~{o.end_time} · {o.place} · {o.purpose}</div>
              {o.status === "rejected" && o.reject_reason && <div style={{ color: COL.red, fontSize: 12, marginTop: 2 }}>사유: {o.reject_reason}</div>}
              {o.status === "pending" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={{ flex: 1, border: "none", borderRadius: 8, padding: 8, fontWeight: 700, background: COL.green, color: "#fff", cursor: "pointer", opacity: busy === o.id ? 0.6 : 1 }} onClick={() => decide(o, true)} disabled={busy === o.id}>승인</button>
                  <button style={{ flex: 1, border: `1px solid ${COL.red}`, borderRadius: 8, padding: 8, fontWeight: 700, background: "#fff0f0", color: COL.red, cursor: "pointer", opacity: busy === o.id ? 0.6 : 1 }} onClick={() => decide(o, false)} disabled={busy === o.id}>반려</button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";

const STATUS = {
  pending: { t: "대기", bg: "#f0ead0", fg: "#b9820f" },
  approved: { t: "승인", bg: "#dcece2", fg: "#3E7C5A" },
  rejected: { t: "반려", bg: "#f6dcd8", fg: "#cb6156" },
};
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const daysUntil = (d) => Math.round((new Date(d + "T00:00:00Z") - new Date(todayStr() + "T00:00:00Z")) / 86400000);
const fmtDate = (d) => { const x = new Date(d + "T00:00:00"); const w = "일월화수목금토"[x.getDay()]; return `${d.slice(5).replace("-", "/")} (${w})`; };

const blank = { workDate: "", startTime: "18:00", endTime: "21:00", place: "", workplaceId: null, purpose: "" };

export default function OvertimeView({ onClose }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);   // {id?, ...fields} — 신청/수정 폼
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [places, setPlaces] = useState([]);
  const [showList, setShowList] = useState(false);

  const load = () => { setLoading(true); api.getMyOvertime().then((d) => setList(d.overtime || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); api.getOutingWorkplaces().then((d) => setPlaces(d.workplaces || [])).catch(() => {}); }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const q = (form?.place || "").trim();
  const matches = q ? places.filter((p) => p.name.includes(q)) : [];

  const openNew = () => { setForm({ ...blank, workDate: "" }); setMsg(""); };
  const openEdit = (o) => { setForm({ id: o.id, workDate: o.work_date, startTime: o.start_time, endTime: o.end_time, place: o.place, workplaceId: o.workplace_id || null, purpose: o.purpose }); setMsg(""); };

  const save = async () => {
    const f = form;
    if (!f.id && !f.workDate) { setMsg("연장 근무일을 선택해주세요."); return; }
    if (!f.place.trim() || !f.purpose.trim()) { setMsg("연장 근무지와 목적을 입력해주세요."); return; }
    if (f.endTime === f.startTime) { setMsg("종료 시간과 시작 시간이 같을 수 없습니다."); return; }
    setBusy(true); setMsg("");
    try {
      const body = { startTime: f.startTime, endTime: f.endTime, place: f.place.trim(), workplaceId: f.workplaceId, purpose: f.purpose.trim() };
      if (f.id) await api.updateOvertime(f.id, body);
      else await api.createOvertime({ ...body, workDate: f.workDate });
      setForm(null); load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const del = async (o) => {
    if (!window.confirm(`${fmtDate(o.work_date)} 연장 근무 신청을 삭제하시겠습니까?`)) return;
    setBusy(true); setMsg("");
    try { await api.deleteOvertime(o.id); setForm(null); load(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  const inp = { ...S.input };
  const lab = { ...S.fieldLabel, marginTop: 10, display: "block" };

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ ...S.formTitle, margin: 0 }}>연장 근무</p>
        <button style={S.subGhost} onClick={onClose}>닫기</button>
      </div>

      {!form && (
        <button style={{ width: "100%", border: `1px solid ${C.blue}`, background: "#fff", color: C.blue, borderRadius: 12, padding: 13, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 12 }} onClick={openNew}>＋ 새 연장 근무 신청</button>
      )}

      {/* 신청/수정 폼 */}
      {form && (
        <div style={{ ...S.formCard, marginTop: 0, marginBottom: 12 }}>
          <p style={S.formTitle}>{form.id ? "연장 근무 수정" : "연장 근무 신청"}</p>
          <label style={{ ...S.fieldLabel, display: "block" }}>연장 근무일 *</label>
          {form.id ? (
            <div style={{ ...inp, color: C.inkSoft, background: "#f5f6f8" }}>{fmtDate(form.workDate)}</div>
          ) : (
            <input type="date" style={inp} value={form.workDate} min={todayStr()} onChange={(e) => setF("workDate", e.target.value)} />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><label style={lab}>시작 *</label><input type="time" style={inp} value={form.startTime} onChange={(e) => setF("startTime", e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={lab}>종료 *</label><input type="time" style={inp} value={form.endTime} onChange={(e) => setF("endTime", e.target.value)} /></div>
          </div>
          <label style={lab}>연장 근무지 *</label>
          <div style={{ position: "relative" }}>
            <input style={inp} value={form.place} placeholder="등록 근무지 검색 또는 직접 입력"
              onChange={(e) => { setF("place", e.target.value); setF("workplaceId", null); setShowList(true); }}
              onFocus={() => setShowList(true)} onBlur={() => setTimeout(() => setShowList(false), 150)} />
            {showList && matches.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 4, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
                {matches.map((p) => (
                  <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setForm((f) => ({ ...f, place: p.name, workplaceId: p.id })); setShowList(false); }}
                    style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "10px 14px", fontSize: 14, color: C.ink, cursor: "pointer", borderBottom: `1px solid ${C.line}` }}>{p.name}</button>
                ))}
              </div>
            )}
          </div>
          <label style={lab}>연장 근무 목적 *</label>
          <input style={inp} value={form.purpose} placeholder="예: 재고 정리 지원" onChange={(e) => setF("purpose", e.target.value)} />
          {msg && <div style={{ ...S.err, marginTop: 8 }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {form.id && daysUntil(form.workDate) >= 0 && <button style={{ ...S.subGhost, color: C.seal, borderColor: C.seal }} onClick={() => del({ id: form.id, work_date: form.workDate })} disabled={busy}>삭제</button>}
            <button style={S.subGhost} onClick={() => setForm(null)} disabled={busy}>취소</button>
            <button style={{ ...S.subPrimary, background: C.blue, opacity: busy ? 0.6 : 1 }} onClick={save} disabled={busy}>{busy ? "처리 중…" : (form.id ? "저장(재승인)" : "신청")}</button>
          </div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 6 }}>신청·삭제: 연장근무일의 본래 근무시간 이내 · 수정: 연장근무일 +2일까지 (수정 시 다시 '대기')</div>
        </div>
      )}

      {/* 리스트 */}
      {!form && (loading ? <div style={{ textAlign: "center", color: C.inkSoft, padding: 20 }}>불러오는 중…</div>
        : list.length === 0 ? <div style={{ textAlign: "center", color: C.inkSoft, padding: 20 }}>신청한 연장 근무가 없습니다.</div>
        : list.map((o) => {
          const st = STATUS[o.status] || STATUS.pending;
          const editable = daysUntil(o.work_date) >= -2;
          return (
            <div key={o.id} onClick={() => editable && openEdit(o)}
              style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", gap: 8, cursor: editable ? "pointer" : "default", background: "#fff" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.ink }}>{fmtDate(o.work_date)} · {o.start_time}~{o.end_time}{o.end_time <= o.start_time ? " (익일)" : ""} · {o.place}</div>
                <div style={{ color: C.inkSoft, fontSize: 13, marginTop: 2 }}>{o.purpose}</div>
                {o.status === "rejected" && o.reject_reason && <div style={{ color: C.seal, fontSize: 12, marginTop: 2 }}>사유: {o.reject_reason}</div>}
              </div>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, height: "fit-content", background: st.bg, color: st.fg }}>{st.t}</span>
            </div>
          );
        }))}
    </div>
  );
}

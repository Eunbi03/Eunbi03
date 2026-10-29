import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";
import { useIsMobile } from "../../utils/useIsMobile.js";

const COL = {
  black: "#3a3a3a", gray: "#787878", lgray: "#eeeeee",
  blue: "#2f6d8f", blueSoft: "#e3eef4", red: "#cb6156", white: "#ffffff",
};

// 자율 메시지 발송 — 상단 필터(법인/본부/팀/직위) + 이름검색(다중) + 문제계정만
export default function AdminMessage({ filters, currentUser }) {
  const isMobile = useIsMobile(760);
  const _perms = currentUser?.permissions || [];
  const canWrite = !!currentUser?.isAuthorityHolder || _perms.includes("staff");

  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("both");   // both | sms | email
  const [problemOnly, setProblemOnly] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [selected, setSelected] = useState([]);      // [{id, name}]
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [attachments, setAttachments] = useState([]); // [{id, filename, url}]
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.getWorkers({}).then((d) => setWorkers(d.workers || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const doSearch = async () => {
    const name = nameInput.trim(); if (!name) return;
    try {
      const d = await api.searchWorkers(name);
      const found = d.workers || [];
      if (!found.length) { alert("해당 이름의 근로자를 찾을 수 없습니다. (권한 밖 팀이면 보이지 않습니다)"); return; }
      setSelected((s) => { const add = found.filter((f) => !s.some((x) => x.id === f.id)); return [...s, ...add]; });
      setNameInput("");
    } catch (e) { alert(e.message); }
  };
  const removeSelected = (id) => setSelected((s) => s.filter((x) => x.id !== id));

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]; if (e.target) e.target.value = "";
    if (!file) return;
    const okType = ["application/pdf", "image/png", "image/jpeg"].includes(file.type);
    if (!okType) { alert("PDF·PNG·JPG 파일만 첨부할 수 있습니다."); return; }
    if (file.size > 20 * 1024 * 1024) { alert("파일은 20MB 이하만 가능합니다."); return; }
    setUploading(true); setMsg(null);
    try {
      const r = await api.uploadMessageAttachment(file);
      setAttachments((a) => [...a, { id: r.id, filename: r.filename, url: r.url }]);
    } catch (err) { setMsg({ text: "첨부 업로드 실패: " + err.message, ok: false }); }
    finally { setUploading(false); }
  };
  const removeAttachment = (id) => setAttachments((a) => a.filter((x) => x.id !== id));

  const isProblem = (w) => !w.device_id || w.must_change_password || w.is_locked;
  const selectedIds = new Set(selected.map((s) => s.id));
  const recipients = workers.filter((w) => {
    if (w.role === "admin" || w.role === "hr") return false;
    if (selected.length) { if (!selectedIds.has(w.id)) return false; }
    else {
      if (filters.corp && w.corp !== filters.corp) return false;
      if (filters.division && w.division !== filters.division) return false;
      if (filters.team && w.team !== filters.team) return false;
      if (filters.position && w.position !== filters.position) return false;
    }
    if (problemOnly && !isProblem(w)) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const send = async () => {
    if (!recipients.length) { alert("발송 대상이 없습니다."); return; }
    if (!window.confirm(`근로자 ${recipients.length}명에게 메시지를 발송하시겠습니까?`)) return;
    if (problemOnly && !window.confirm("문제계정만 보기가 활성화되어 있습니다.\n화면에 뜨는 근로자에게만 문자가 발송됩니다. 맞습니까?")) return;
    setSending(true); setMsg(null);
    try {
      const r = await api.sendFreeMessage({ userIds: recipients.map((w) => w.id), channel, attachmentIds: attachments.map((a) => a.id) });
      const fail = (r.results || []).filter((x) => x.via === "none");
      let text = `발송 완료: ${r.sent}/${r.total}명`;
      if (fail.length) text += ` · 미발송 ${fail.length}명(이메일·전화번호 없음 또는 설정 누락): ${fail.map((f) => f.name).join(", ")}`;
      setMsg({ text, ok: fail.length === 0 });
    } catch (e) { setMsg({ text: e.message, ok: false }); }
    finally { setSending(false); }
  };

  if (!canWrite) {
    return <div style={{ ...S.empty, color: C.inkSoft }}>자율 메시지 발송 권한(근로자 관리 쓰기)이 없습니다.</div>;
  }

  const chip = (val, label) => (
    <button onClick={() => setChannel(val)}
      style={{ border: `1px solid ${channel === val ? COL.blue : C.lineAdmin}`, background: channel === val ? COL.blue : "#fff",
        color: channel === val ? "#fff" : C.inkSoft, borderRadius: 999, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{label}</button>
  );

  return (
    <div>
      <div style={{ background: "#fff", border: `1px solid ${C.lineAdmin}`, borderRadius: 14, padding: isMobile ? 16 : 20 }}>
        <p style={{ fontWeight: 800, fontSize: 18, color: C.ink, margin: "0 0 4px" }}>자율 메시지 발송</p>
        <p style={{ fontSize: 12.5, color: COL.gray, margin: "0 0 14px" }}>내용은 설정 → 발송 메시지 관리의 <b>'자율 메시지'</b>에서 작성합니다. 상단 필터 또는 아래 이름 검색으로 대상을 고르세요.</p>

        {/* 발송 방식 */}
        <label style={{ fontSize: 12, fontWeight: 700, color: COL.gray }}>발송 방식</label>
        <div style={{ display: "flex", gap: 8, margin: "6px 0 4px", flexWrap: "wrap" }}>
          {chip("both", "둘 다")}{chip("sms", "문자")}{chip("email", "이메일")}
        </div>
        <p style={{ fontSize: 11.5, color: COL.gray, margin: "0 0 14px" }}>
          {channel === "both" && "※ 이메일이 등록돼 있으면 이메일, 없으면 전화번호로 문자 발송"}
          {channel === "sms" && "※ 전화번호로 문자 발송(전화번호 없으면 미발송)"}
          {channel === "email" && "※ 이메일로 발송(이메일 없으면 미발송)"}
        </p>

        {/* 이름 검색(다중) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", border: `1px solid ${C.lineAdmin}`, borderRadius: 10, padding: "8px 10px" }}>
          {selected.map((s) => (
            <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: COL.blueSoft, color: COL.blue, borderRadius: 999, padding: "3px 10px", fontSize: 13, fontWeight: 700 }}>
              {s.name}<button onClick={() => removeSelected(s.id)} style={{ border: "none", background: "transparent", color: COL.blue, cursor: "pointer", fontSize: 13 }}>×</button>
            </span>
          ))}
          <input value={nameInput} placeholder={selected.length ? "" : "인원 직접 입력(이름 검색)"} onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
            style={{ flex: "1 1 120px", border: "none", outline: "none", fontSize: 14, minWidth: 80 }} />
          {nameInput && <button onClick={doSearch} style={{ ...S.subGhost, padding: "6px 12px" }}>검색</button>}
          {selected.length > 0 && <button onClick={() => { setSelected([]); setNameInput(""); }} style={{ border: "none", background: "transparent", color: COL.gray, cursor: "pointer", fontSize: 13 }}>초기화</button>}
        </div>

        {/* 문제계정만 */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: C.ink, cursor: "pointer" }}>
          <input type="checkbox" checked={problemOnly} onChange={(e) => setProblemOnly(e.target.checked)} style={{ width: 18, height: 18, accentColor: COL.blue }} />
          문제계정만 (기기미등록·비번미변경·잠김) — 앱 설치 안내 보낼 때
        </label>

        {/* 파일 첨부 */}
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: COL.gray }}>파일 첨부 (PDF·PNG·JPG, 20MB 이하)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" style={{ display: "none" }} onChange={onPickFile} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ ...S.subGhost, padding: "7px 14px" }}>{uploading ? "업로드 중…" : "파일 선택"}</button>
            {attachments.map((a) => (
              <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: COL.blueSoft, color: COL.blue, borderRadius: 999, padding: "4px 11px", fontSize: 12.5, fontWeight: 700 }}>
                📎 {a.filename}<button onClick={() => removeAttachment(a.id)} style={{ border: "none", background: "transparent", color: COL.blue, cursor: "pointer", fontSize: 13 }}>×</button>
              </span>
            ))}
          </div>
          {attachments.length > 0 && <p style={{ fontSize: 11.5, color: COL.gray, margin: "6px 0 0" }}>※ 이메일은 파일 첨부 + 링크, 문자는 다운로드 링크로 전달됩니다.</p>}
        </div>

        {msg && <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: msg.ok ? "#2f8f5b" : COL.red, background: msg.ok ? "#e2f1e9" : "#fff0f0", borderRadius: 8, padding: "9px 12px" }}>{msg.text}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, color: C.ink }}>발송 대상 <b style={{ color: COL.blue }}>{recipients.length}</b>명
            {selected.length ? " (이름 검색)" : " (필터 기준)"}{problemOnly ? " · 문제계정만" : ""}</div>
          <button onClick={send} disabled={sending || !recipients.length}
            style={{ border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 15, fontWeight: 800, background: recipients.length ? COL.blue : COL.lgray, color: "#fff", cursor: recipients.length ? "pointer" : "default", opacity: sending ? 0.6 : 1 }}>
            {sending ? "발송 중…" : "메시지 발송"}</button>
        </div>
      </div>

      {/* 대상 미리보기 */}
      {loading ? <div style={S.empty}>불러오는 중…</div> : (
        <div style={{ marginTop: 14 }}>
          {recipients.length === 0 ? <div style={S.empty}>발송 대상이 없습니다.</div> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {recipients.map((w) => (
                <span key={w.id} style={{ fontSize: 12.5, background: "#fff", border: `1px solid ${C.lineAdmin}`, borderRadius: 999, padding: "4px 11px", color: C.ink }}>
                  {w.name}<span style={{ color: COL.gray }}>{w.email ? " · 이메일" : w.phone ? " · 문자" : " · 연락처없음"}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

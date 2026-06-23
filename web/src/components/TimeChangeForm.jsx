import { useState } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";

export default function TimeChangeForm({ onClose, onDone }) {
  const [requestedEnd, setRequestedEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!requestedEnd) { setErr("변경할 퇴근 시간을 선택해주세요."); return; }
    if (!reason.trim()) { setErr("변경 사유를 입력해주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      await api.requestTimeChange(requestedEnd, reason);
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.formCard, marginTop: 0 }}>
      <p style={S.formTitle}>퇴근 시간 변경 요청</p>
      <label style={S.fieldLabel}>변경할 퇴근 시간 *</label>
      <input style={S.input} type="time" value={requestedEnd} onChange={(e) => setRequestedEnd(e.target.value)} />
      <label style={S.fieldLabel}>사유 *</label>
      <input style={S.input} value={reason} placeholder="변경 사유를 입력해주세요" onChange={(e) => setReason(e.target.value)} />
      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button style={{ ...S.subPrimary, background: C.amber, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
          {busy ? "처리 중…" : "요청"}
        </button>
      </div>
    </div>
  );
}

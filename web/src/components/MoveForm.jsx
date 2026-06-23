import { useState } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

export default function MoveForm({ onClose, onDone }) {
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!destination.trim()) { setErr("목적지를 입력해주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      await api.startOuting(loc, destination, reason);
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.formCard, marginTop: 0 }}>
      <p style={S.formTitle}>외출 시작</p>
      <label style={S.fieldLabel}>목적지 *</label>
      <input style={S.input} value={destination} placeholder="예: 거래처 미팅" onChange={(e) => setDestination(e.target.value)} />
      <label style={S.fieldLabel}>사유</label>
      <input style={S.input} value={reason} placeholder="선택 입력" onChange={(e) => setReason(e.target.value)} />
      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button style={{ ...S.subPrimary, background: C.amber, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
          {busy ? "처리 중…" : "외출 시작"}
        </button>
      </div>
    </div>
  );
}

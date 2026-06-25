import { useState } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

export default function OutForm({ onClose, onDone }) {
  const [workNoteIn, setWorkNoteIn] = useState("");
  const [workNoteOut, setWorkNoteOut] = useState("");
  const [workNoteField, setWorkNoteField] = useState("");
  const [workNoteToday, setWorkNoteToday] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!workNoteToday.trim()) { setErr("오늘 업무 내용을 입력해주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      await api.checkOut(loc, { workNoteIn, workNoteOut, workNoteField, workNoteToday });
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.formCard, marginTop: 0 }}>
      <p style={S.formTitle}>퇴근 및 업무 노트</p>

      <label style={S.fieldLabel}>출근 장소</label>
      <input
        style={S.input}
        placeholder="예: 본사, 재택, 현장명…"
        value={workNoteIn}
        onChange={(e) => setWorkNoteIn(e.target.value)}
      />

      <label style={S.fieldLabel}>퇴근 장소</label>
      <input
        style={S.input}
        placeholder="예: 본사, 재택, 현장명…"
        value={workNoteOut}
        onChange={(e) => setWorkNoteOut(e.target.value)}
      />

      <label style={S.fieldLabel}>외근 장소 (선택)</label>
      <input
        style={S.input}
        placeholder="외근이 있었다면 장소를 입력해주세요"
        value={workNoteField}
        onChange={(e) => setWorkNoteField(e.target.value)}
      />

      <label style={S.fieldLabel}>오늘 업무 내용 *</label>
      <textarea
        style={{ ...S.input, minHeight: 80, resize: "vertical" }}
        placeholder="오늘 진행한 업무를 입력해주세요"
        value={workNoteToday}
        onChange={(e) => setWorkNoteToday(e.target.value)}
      />

      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button
          style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }}
          onClick={submit} disabled={busy}
        >
          {busy ? "처리 중…" : "퇴근"}
        </button>
      </div>
    </div>
  );
}

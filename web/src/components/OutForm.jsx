import { useState } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

export default function OutForm({ onClose, onDone, workplaceName, checkInPlace = null, initialNote = "", outings = [], activeOuting = null }) {
  const dests = outings.map((o) => o.destination).filter(Boolean);
  // "외근지에서 바로 퇴근?"은 복귀하지 않고 진행 중인 외근이 있을 때만 물어본다.
  const lastDest = activeOuting?.destination || "";

  // 출근 장소: 외근지에서 출근한 것으로 판단되면 그 외근지를, 아니면 기본 근무지를 기본값으로.
  const [workNoteIn, setWorkNoteIn] = useState(checkInPlace || workplaceName || "");
  const [workNoteOut, setWorkNoteOut] = useState(workplaceName || "");
  // 외근 장소: 오늘 다녀온 외근지들을 순서대로 자동 기입 (수정 가능)
  const [workNoteField, setWorkNoteField] = useState(dests.join(", "));
  const [workNoteToday, setWorkNoteToday] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 진행 중인 외근이 있을 때만 "외근지에서 바로 퇴근?" 팝업을 띄운다. (복귀했으면 안 뜸)
  const [askOuting, setAskOuting] = useState(!!activeOuting);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      if (!loc) { setErr("위치를 가져올 수 없습니다. 위치 권한과 GPS를 확인해주세요."); setBusy(false); return; }
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

      <label style={S.fieldLabel}>오늘 업무 내용</label>
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

      {/* 외근지에서 바로 퇴근하는지 확인 */}
      {askOuting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", maxWidth: 320, width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.5, margin: "0 0 18px" }}>
              외근지에서 바로 퇴근하시겠습니까?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...S.subGhost, flex: 1 }}
                onClick={() => { setWorkNoteOut(workplaceName || ""); setAskOuting(false); }}
              >아니요</button>
              <button
                style={{ ...S.subPrimary, flex: 1, background: C.amber }}
                onClick={() => { setWorkNoteOut(lastDest); setAskOuting(false); }}
              >예</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

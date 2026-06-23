import { useState } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

export default function OutForm({ user, workplaceId, onClose, onDone }) {
  const [dailyReport, setDailyReport] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [isField, setIsField] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!dailyReport.trim()) { setErr("오늘 업무 내용을 입력해주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      await api.checkOut(loc, { isFieldCheckout: isField, workplaceId, dailyReport, tomorrowPlan });
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.formCard, marginTop: 0 }}>
      <p style={S.formTitle}>퇴근</p>
      <label style={S.fieldLabel}>오늘 업무 내용 *</label>
      <textarea
        style={{ ...S.input, minHeight: 72, resize: "vertical" }}
        value={dailyReport}
        placeholder="오늘 진행한 업무를 입력해주세요"
        onChange={(e) => setDailyReport(e.target.value)}
      />
      <label style={S.fieldLabel}>내일 업무 계획</label>
      <textarea
        style={{ ...S.input, minHeight: 56, resize: "vertical" }}
        value={tomorrowPlan}
        placeholder="내일 예정된 업무 (선택)"
        onChange={(e) => setTomorrowPlan(e.target.value)}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ink, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={isField} onChange={(e) => setIsField(e.target.checked)} />
        현장 퇴근 (위치 체크 생략)
      </label>
      {err && <div style={S.err}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={S.subGhost} onClick={onClose} disabled={busy}>취소</button>
        <button style={{ ...S.subPrimary, background: C.ink, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>
          {busy ? "처리 중…" : "퇴근"}
        </button>
      </div>
    </div>
  );
}

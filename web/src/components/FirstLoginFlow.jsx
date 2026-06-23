import { useState } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";

export default function FirstLoginFlow({ onDone }) {
  const [step, setStep] = useState("password"); // password | consent
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const savePassword = async () => {
    if (newPw.length < 8) { setErr("비밀번호는 8자 이상이어야 합니다."); return; }
    if (newPw !== confirm) { setErr("비밀번호가 일치하지 않습니다."); return; }
    setBusy(true);
    setErr("");
    try {
      await api.changePassword(newPw);
      setStep("consent");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const giveConsent = async () => {
    setBusy(true);
    try {
      await api.giveLocationConsent();
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 20 }}>
      <div style={{ ...S.loginCard, width: "100%", maxWidth: 380 }}>
        {step === "password" && (
          <>
            <p style={S.h1}>초기 비밀번호 변경</p>
            <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14 }}>
              보안을 위해 초기 비밀번호를 변경해주세요.
            </p>
            <label style={S.fieldLabel}>새 비밀번호 (8자 이상)</label>
            <input style={S.input} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            <label style={S.fieldLabel}>비밀번호 확인</label>
            <input style={S.input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {err && <div style={S.err}>{err}</div>}
            <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} onClick={savePassword} disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </>
        )}

        {step === "consent" && (
          <>
            <p style={S.h1}>위치 정보 수집 동의</p>
            <p style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, marginBottom: 14 }}>
              출퇴근 확인 및 근무 중 위치 확인을 위해 위치 정보를 수집합니다.<br />
              수집된 위치 정보는 근태 관리 목적으로만 사용됩니다.
            </p>
            {err && <div style={S.err}>{err}</div>}
            <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} onClick={giveConsent} disabled={busy}>
              {busy ? "처리 중…" : "동의하고 시작"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

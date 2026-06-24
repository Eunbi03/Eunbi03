import { useState } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";

export default function FirstLoginFlow({ onDone }) {
  const [step, setStep] = useState("password"); // password | consent
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pwMismatch = confirmTouched && confirm.length > 0 && newPw !== confirm;
  const pwMatch = confirmTouched && confirm.length > 0 && newPw === confirm;

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
      <div style={{ ...S.loginCard, width: "100%", maxWidth: 400 }}>

        {step === "password" && (
          <>
            <p style={S.h1}>비밀번호 변경</p>
            <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 16 }}>
              보안을 위해 초기 비밀번호를 변경해주세요. (8자 이상)
            </p>

            <label style={S.fieldLabel}>새 비밀번호</label>
            <input
              style={S.input}
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />

            <label style={S.fieldLabel}>비밀번호 확인</label>
            <input
              style={{
                ...S.input,
                ...(pwMismatch ? { borderColor: C.seal, boxShadow: `0 0 0 2px ${C.sealSoft}` } : {}),
                ...(pwMatch ? { borderColor: C.green, boxShadow: `0 0 0 2px ${C.greenSoft}` } : {}),
              }}
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setConfirmTouched(true); }}
              onBlur={() => setConfirmTouched(true)}
              autoComplete="new-password"
            />
            {pwMismatch && (
              <div style={{ fontSize: 12, color: C.seal, marginTop: -6, marginBottom: 8 }}>
                비밀번호가 일치하지 않습니다.
              </div>
            )}
            {pwMatch && (
              <div style={{ fontSize: 12, color: C.green, marginTop: -6, marginBottom: 8 }}>
                비밀번호가 일치합니다.
              </div>
            )}

            {err && <div style={S.err}>{err}</div>}
            <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} onClick={savePassword} disabled={busy}>
              {busy ? "저장 중…" : "저장하고 계속"}
            </button>
          </>
        )}

        {step === "consent" && (
          <>
            <p style={S.h1}>위치 정보 수집·이용 동의</p>

            <div style={{ background: C.bg, borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 12, color: C.ink, lineHeight: 1.8 }}>
              <p style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>개인정보 수집·이용 안내</p>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <tbody>
                  {[
                    ["수집 항목", "위치 정보(위도·경도·정확도)"],
                    ["수집 목적", "출퇴근 확인, 외출·복귀 기록, 근무 중 무작위 위치 체크"],
                    ["보유 기간", "근로계약 종료 후 3년 (근로기준법 제42조)"],
                    ["제3자 제공", "원칙적 미제공 (법령에 따른 요구 시 예외)"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: "4px 8px 4px 0", fontWeight: 700, color: C.inkSoft, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                      <td style={{ padding: "4px 0", color: C.ink }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 12, padding: "10px 12px", background: "#fff", borderRadius: 8, fontSize: 11, color: C.inkSoft, lineHeight: 1.7 }}>
                <b style={{ color: C.ink }}>위치정보의 보호 및 이용 등에 관한 법률 제18조</b>에 따라
                위치 정보 수집에 대한 동의를 받습니다.<br />
                동의를 거부할 권리가 있으나, 거부 시 출퇴근 체크 서비스 이용이 제한됩니다.<br />
                개인정보 처리에 관한 문의는 인사팀으로 연락해주세요.
              </div>
            </div>

            {err && <div style={S.err}>{err}</div>}
            <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} onClick={giveConsent} disabled={busy}>
              {busy ? "처리 중…" : "동의하고 시작하기"}
            </button>
            <p style={{ fontSize: 11, color: C.inkSoft, textAlign: "center", marginTop: 8 }}>
              위 내용에 동의하셔야 서비스를 이용할 수 있습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

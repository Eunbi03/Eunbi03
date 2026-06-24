import { useState } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";
import Terms from "./Terms.jsx";

export default function FirstLoginFlow({ onDone }) {
  const [step, setStep] = useState("password"); // password | consent
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showTerms, setShowTerms] = useState(false);

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
    <>
      {showTerms && <Terms onClose={() => setShowTerms(false)} />}

      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 20 }}>
        <div style={{ ...S.loginCard, width: "100%", maxWidth: 400 }}>

          {/* 단계 표시 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {["비밀번호 변경", "위치정보 동의"].map((label, i) => {
              const idx = step === "password" ? 0 : 1;
              const done = i < idx;
              const active = i === idx;
              return (
                <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800,
                    background: done ? C.green : active ? C.ink : C.line,
                    color: done || active ? "#fff" : C.inkSoft,
                  }}>{done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 11, color: active ? C.ink : C.inkSoft, fontWeight: active ? 700 : 400 }}>{label}</span>
                </div>
              );
            })}
          </div>

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
              <p style={S.h1}>위치정보 수집·이용 동의</p>

              <div style={{ background: C.bg, borderRadius: 10, padding: "14px 16px", marginBottom: 14, fontSize: 12, color: C.ink, lineHeight: 1.8 }}>
                <p style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>개인정보 수집·이용 안내</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <tbody>
                    {[
                      ["수집 항목", "GPS 위치정보(위도·경도·정확도)"],
                      ["수집 목적", "출퇴근 확인, 외출·복귀 기록, 랜덤 위치 확인"],
                      ["보유 기간", "퇴사 후 3년 (근로기준법 제42조)"],
                      ["제3자 제공", "없음 (법령 요청 제외)"],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: "4px 8px 4px 0", fontWeight: 700, color: C.inkSoft, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                        <td style={{ padding: "4px 0" }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: "#fffbeb", border: `1px solid ${C.amberSoft}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 11, color: C.ink, lineHeight: 1.7 }}>
                「위치정보의 보호 및 이용 등에 관한 법률」 제18조에 따라 위치정보 수집·이용에 동의를 받습니다.
                동의를 거부할 수 있으나, 거부 시 출퇴근 체크 서비스 이용이 제한됩니다.
              </div>

              <button
                onClick={() => setShowTerms(true)}
                style={{ width: "100%", padding: "9px", background: "none", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 12, color: C.ink, cursor: "pointer", marginBottom: 12 }}
              >
                개인정보처리방침 및 이용약관 전체 보기 →
              </button>

              {err && <div style={S.err}>{err}</div>}
              <button style={{ ...S.primary, opacity: busy ? 0.6 : 1 }} onClick={giveConsent} disabled={busy}>
                {busy ? "처리 중…" : "위 내용에 동의하고 시작하기"}
              </button>
              <p style={{ fontSize: 11, color: C.inkSoft, textAlign: "center", marginTop: 8 }}>
                동의하셔야 서비스 이용이 가능합니다.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

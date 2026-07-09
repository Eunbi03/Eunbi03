import { useState } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";
import Terms from "./Terms.jsx";

// 근로자 로그인 화면과 동일한 디자인 팔레트
const WBG = "#f4f6f7";
const CARD = { background: "#fff", borderRadius: 18, boxShadow: "0 8px 28px rgba(30,36,48,0.12)", padding: "28px 24px" };
const INPUT = { border: "1px solid #c9e6f4", borderRadius: 10, padding: "12px 14px", fontSize: 15, width: "100%", boxSizing: "border-box", color: "#333", background: "#fff" };
const LABEL = { fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", margin: "10px 0 6px" };
const PRIMARY = { width: "100%", border: "none", borderRadius: 10, padding: 13, fontSize: 16, fontWeight: 700, color: "#fff", background: "#333333", cursor: "pointer", marginTop: 8 };
const H1 = { fontSize: 22, fontWeight: 800, color: "#333", margin: "0 0 6px", letterSpacing: "-0.02em" };
const ERRSTYLE = { fontSize: 13, color: "#cb6156", fontWeight: 600, marginTop: 8 };

export default function FirstLoginFlow({ onDone }) {
  const [step, setStep] = useState("password"); // password | consent
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [termsRead, setTermsRead] = useState(false);

  const pwMismatch = confirmTouched && confirm.length > 0 && newPw !== confirm;
  const pwMatch = confirmTouched && confirm.length > 0 && newPw === confirm;

  const savePassword = async () => {
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPw)) { setErr("비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다."); return; }
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
    if (!termsRead) { setErr("약관을 끝까지 확인한 후 동의해주세요."); return; }
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
      {showTerms && (
        <Terms
          onRead={() => setTermsRead(true)}
          onClose={() => setShowTerms(false)}
        />
      )}

      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: WBG, padding: 20 }}>
        <div style={{ ...CARD, width: "100%", maxWidth: 420 }}>

          {/* 단계 표시 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {["비밀번호 변경", "위치정보 동의"].map((label, i) => {
              const idx = step === "password" ? 0 : 1;
              const done = i < idx;
              const active = i === idx;
              return (
                <div key={i} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800,
                    background: done ? C.green : active ? C.ink : "#c9e6f4",
                    color: done || active ? "#fff" : C.inkSoft,
                  }}>{done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 12, color: active ? C.ink : C.inkSoft, fontWeight: active ? 700 : 400 }}>{label}</span>
                </div>
              );
            })}
          </div>

          {step === "password" && (
            <>
              <p style={H1}>비밀번호 변경</p>
              <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 16 }}>
                보안을 위해 초기 비밀번호를 변경해주세요. (영문·숫자 포함 8자 이상)
              </p>

              <label style={LABEL}>새 비밀번호</label>
              <input
                style={INPUT}
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
              />

              <label style={LABEL}>비밀번호 확인</label>
              <input
                style={{
                  ...INPUT,
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
                <div style={{ fontSize: 13, color: C.seal, marginTop: -4, marginBottom: 4 }}>
                  비밀번호가 일치하지 않습니다.
                </div>
              )}
              {pwMatch && (
                <div style={{ fontSize: 13, color: C.green, marginTop: -4, marginBottom: 4 }}>
                  비밀번호가 일치합니다.
                </div>
              )}

              {err && <div style={ERRSTYLE}>{err}</div>}
              <button style={{ ...PRIMARY, opacity: busy ? 0.6 : 1 }} onClick={savePassword} disabled={busy}>
                {busy ? "저장 중…" : "저장하고 계속"}
              </button>
            </>
          )}

          {step === "consent" && (
            <>
              <p style={H1}>위치정보 수집·이용 동의</p>

              {/* 동의 내용 테이블 — 글씨 키움 */}
              <div style={{ background: C.paper, borderRadius: 12, padding: "16px 18px", marginBottom: 14, fontSize: 14, color: C.ink, lineHeight: 1.9 }}>
                <p style={{ fontWeight: 800, marginBottom: 10, fontSize: 15 }}>개인정보 수집·이용 안내</p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {[
                      ["수집 항목", "GPS 위치정보 (위도·경도·정확도)"],
                      ["수집 목적", "출퇴근 거리 기록, 외출 기록, 랜덤 위치 확인"],
                      ["보유 기간", "퇴사 후 3년 (근로기준법 제42조)"],
                      ["제3자 제공", "없음 (법령 요청 제외)"],
                    ].map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: `1px solid ${C.line}` }}>
                        <td style={{ padding: "7px 10px 7px 0", fontWeight: 700, color: C.inkSoft, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                        <td style={{ padding: "7px 0" }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 법적 고지 */}
              <div style={{ background: "#fffbeb", border: `1px solid ${C.amberSoft}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: C.ink, lineHeight: 1.8 }}>
                「위치정보의 보호 및 이용 등에 관한 법률」 제18조에 따라 위치정보 수집·이용에 동의를 받습니다.
                동의를 거부할 수 있으나, 거부 시 출퇴근 체크 서비스 이용이 제한됩니다.
              </div>

              {/* 약관 전체 보기 */}
              <button
                onClick={() => setShowTerms(true)}
                style={{
                  width: "100%", padding: "11px",
                  background: "none",
                  border: `2px solid ${termsRead ? C.green : C.line}`,
                  borderRadius: 10, fontSize: 14,
                  color: termsRead ? C.green : C.ink,
                  fontWeight: termsRead ? 700 : 400,
                  cursor: "pointer", marginBottom: 12,
                  transition: "border-color 0.2s, color 0.2s",
                }}
              >
                {termsRead ? "✓ 개인정보처리방침 및 이용약관 확인 완료" : "개인정보처리방침 및 이용약관 전체 보기 →"}
              </button>

              {!termsRead && (
                <p style={{ fontSize: 13, color: C.seal, fontWeight: 600, textAlign: "center", margin: "-4px 0 10px" }}>
                  약관을 끝까지 확인하셔야 동의가 가능합니다.
                </p>
              )}

              {err && <div style={ERRSTYLE}>{err}</div>}
              <button
                style={{
                  ...PRIMARY,
                  opacity: (busy || !termsRead) ? 0.5 : 1,
                  cursor: termsRead && !busy ? "pointer" : "not-allowed",
                }}
                onClick={giveConsent}
                disabled={busy || !termsRead}
              >
                {busy ? "처리 중…" : "위 내용에 동의하고 시작하기"}
              </button>

              <p style={{ fontSize: 12, color: C.inkSoft, textAlign: "center", marginTop: 4 }}>
                동의하셔야 서비스 이용이 가능합니다.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

import { useState } from "react";
import { C, S } from "../styles.js";
import { getDeviceId } from "../utils/device.js";
import * as api from "../api/client.js";

// 직원용 / 관리자용 테마를 완전히 다르게 구성합니다
const THEMES = {
  worker: {
    pageBg: "#f4f6f7",
    cardBg: "#ffffff",
    cardBorder: "transparent",     // 테두리 없이 그림자만
    cardShadow: "0 8px 28px rgba(30,36,48,0.12)",
    title: "TimeCard",
    subtitle: null,
    titleColor: C.ink,
    subColor: C.inkSoft,
    icon: null,            // 직원용은 아이콘 없음
    badge: null,
    titleSize: 22,
    labelSize: 12,
    inputSize: 15,
    idLabel: "전화번호",
    idType: "tel",
    idAutoComplete: "username",
    idPlaceholder: "하이픈 없이 숫자만 (예: 01012345678)",
    inputBg: "#fff",
    inputBorder: "#c9e6f4",
    inputColor: C.ink,
    labelColor: C.inkSoft,
    btnBg: "#333333",
    btnColor: "#fff",
    linkColor: C.ink,
    crossText: "관리자이신가요?",
    crossLabel: "관리자 페이지",
    crossHref: "/admin",
  },
  admin: {
    pageBg: "#070a10",            // 더 어둡게 — 카드와 단차 강화
    cardBg: "#1e2536",           // 더 밝게 — 떠 보이게
    cardBorder: "#39435a",
    cardShadow: "0 20px 60px rgba(0,0,0,0.6)",
    title: "관리자 콘솔",
    subtitle: "Admin Console",
    titleColor: "#fff",
    subColor: "#8b94a8",
    icon: "",
    badge: { text: "관리자·인사팀 전용", bg: "#2d4a7a", color: "#cfe0f5" },
    titleSize: 28,               // 크게
    labelSize: 14,               // 크게
    inputSize: 16,               // 크게
    idLabel: "이메일",
    idType: "email",
    idAutoComplete: "email",
    idPlaceholder: "",
    inputBg: "#10141d",
    inputBorder: "#39435a",
    inputColor: "#fff",
    labelColor: "#aab3c5",
    btnBg: "#2d6cdf",
    btnColor: "#fff",
    linkColor: "#7fa8e8",
    crossText: "직원 출퇴근 화면은",
    crossLabel: "여기",
    crossHref: "/",
  },
};

export default function Login({ onLogin, mode = "worker", extraError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [failCount, setFailCount] = useState(0);
  const [serverNote, setServerNote] = useState(""); // 기기 불일치 등 조치가 필요한 실제 안내

  const t = THEMES[mode] || THEMES.worker;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr(`${t.idLabel}와 비밀번호를 입력해주세요.`); return; }
    setBusy(true);
    setErr("");
    setServerNote("");
    try {
      const deviceId = await getDeviceId();
      // 근로자는 전화번호(숫자만), 관리자는 이메일(소문자)로 로그인
      const username = mode === "admin" ? email.trim().toLowerCase() : email.replace(/\D/g, "");
      const user = await api.login({ username, password, deviceId });
      onLogin(user);
    } catch (e) {
      setErr(e.message);
      // 서버의 실제 누적 실패 횟수와 연동 (remainingAttempts = 5 - 누적실패)
      const rem = e.payload?.remainingAttempts;
      const msg = e.message || "";
      const isLocked = /(잠겼|잠금)/.test(msg);
      // 기기 불일치/승인 대기 등 조치가 필요한 사유(403, 잠금 제외)는 실제 안내를 그대로 노출
      if (e.status === 403 && !isLocked) setServerNote(msg);
      if (typeof rem === "number") setFailCount(Math.max(1, 5 - rem));
      else if (isLocked) setFailCount(5);
      else setFailCount((c) => c + 1);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: "12px 14px",
    fontSize: t.inputSize, color: t.inputColor, background: t.inputBg,
    width: "100%", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: t.labelSize, fontWeight: 700, color: t.labelColor };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: t.pageBg, padding: 20, transition: "background 0.2s" }}>
      <form
        style={{
          width: "100%", maxWidth: 360, background: t.cardBg,
          border: `1px solid ${t.cardBorder}`, borderRadius: 18,
          padding: "28px 24px", display: "flex", flexDirection: "column", gap: 12,
          boxShadow: t.cardShadow,
        }}
        onSubmit={submit}
      >
        {/* 헤더 */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          {t.icon && (
            <div style={{
              width: 56, height: 56, borderRadius: 16, background: "#2b3242",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, margin: "0 auto 12px",
            }}>{t.icon}</div>
          )}

          {t.badge && (
            <div style={{
              display: "inline-block", background: t.badge.bg, color: t.badge.color,
              fontSize: 12, fontWeight: 700, padding: "5px 14px", borderRadius: 20,
              marginBottom: 12, letterSpacing: 0.5,
            }}>{t.badge.text}</div>
          )}

          <p style={{ fontSize: t.titleSize, fontWeight: 800, color: t.titleColor, margin: 0, letterSpacing: "-0.02em" }}>{t.title}</p>
          {t.subtitle && (
            <p style={{ fontSize: 13, color: t.subColor, margin: "6px 0 0", letterSpacing: "0.06em" }}>{t.subtitle}</p>
          )}
        </div>

        <label style={labelStyle}>{t.idLabel}</label>
        <input
          style={inputStyle}
          type={t.idType}
          autoComplete={t.idAutoComplete}
          placeholder={t.idPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <label style={labelStyle}>비밀번호</label>
        <input
          style={inputStyle}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        {mode === "admin" && (err || extraError) && (
          <div style={{ fontSize: 13, color: "#ff8e84", fontWeight: 600 }}>
            {err || extraError}
          </div>
        )}

        <button
          style={{ border: "none", borderRadius: 10, padding: 13, fontSize: 16, fontWeight: 700, color: t.btnColor, background: t.btnBg, marginTop: 4, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          type="submit"
          disabled={busy}
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>

        {mode === "admin" && (
          <div style={{ textAlign: "center", marginTop: 10, fontSize: 13, color: t.subColor }}>
            {t.crossText}{" "}
            <a href={t.crossHref} style={{ color: t.linkColor, fontWeight: 700, textDecoration: "none" }}>{t.crossLabel}</a>
          </div>
        )}
      </form>

      {mode !== "admin" && (
        <p
          style={{
            maxWidth: 360,
            textAlign: "center",
            margin: "18px 0 0",
            fontSize: 13,
            lineHeight: 1.6,
            fontWeight: 600,
            whiteSpace: "pre-line",
            color: failCount >= 1 || extraError || serverNote ? "#cb6156" : "#333333",
          }}
        >
          {extraError
            ? extraError
            : serverNote
            ? serverNote
            : failCount >= 5
            ? "로그인에 실패했습니다.\n인사팀에 문의해주세요."
            : failCount >= 1
            ? "로그인에 실패했습니다."
            : "로그인을 해주세요."}
        </p>
      )}
    </div>
  );
}

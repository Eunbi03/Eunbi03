import { useState } from "react";
import { C, S } from "../styles.js";
import { getDeviceId } from "../utils/device.js";
import * as api from "../api/client.js";

// 직원용 / 관리자용 테마를 완전히 다르게 구성합니다
const THEMES = {
  worker: {
    pageBg: C.paper,
    cardBg: C.card,
    cardBorder: C.line,
    title: "근태 관리",
    subtitle: "출퇴근 체크",
    titleColor: C.ink,
    subColor: C.inkSoft,
    icon: "🕐",
    iconBg: C.greenSoft,
    badge: null,
    inputBg: "#fff",
    inputBorder: C.line,
    inputColor: C.ink,
    labelColor: C.inkSoft,
    btnBg: C.seal,
    btnColor: "#fff",
    linkColor: C.ink,
    crossText: "관리자이신가요?",
    crossLabel: "관리자 페이지",
    crossHref: "/admin",
  },
  admin: {
    pageBg: "#10141d",
    cardBg: "#1a1f2e",
    cardBorder: "#2b3242",
    title: "관리자 콘솔",
    subtitle: "Admin Console",
    titleColor: "#fff",
    subColor: "#7b8499",
    icon: "🛡️",
    iconBg: "#2b3242",
    badge: { text: "관리자·인사팀 전용", bg: "#2d4a7a", color: "#cfe0f5" },
    inputBg: "#10141d",
    inputBorder: "#2b3242",
    inputColor: "#fff",
    labelColor: "#9aa3b5",
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

  const t = THEMES[mode] || THEMES.worker;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr("이메일과 비밀번호를 입력해주세요."); return; }
    setBusy(true);
    setErr("");
    try {
      const deviceId = await getDeviceId();
      const user = await api.login({ email: email.trim().toLowerCase(), password, deviceId });
      onLogin(user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: t.pageBg, padding: 20, transition: "background 0.2s" }}>
      <form
        style={{
          width: "100%", maxWidth: 360, background: t.cardBg,
          border: `1px solid ${t.cardBorder}`, borderRadius: 18,
          padding: "28px 24px", display: "flex", flexDirection: "column", gap: 12,
          boxShadow: mode === "admin" ? "0 12px 40px rgba(0,0,0,0.45)" : "0 6px 24px rgba(30,36,48,0.08)",
        }}
        onSubmit={submit}
      >
        {/* 아이콘 + 타이틀 */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: t.iconBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, margin: "0 auto 12px",
          }}>{t.icon}</div>

          {t.badge && (
            <div style={{
              display: "inline-block", background: t.badge.bg, color: t.badge.color,
              fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
              marginBottom: 10, letterSpacing: 0.5,
            }}>{t.badge.text}</div>
          )}

          <p style={{ fontSize: 22, fontWeight: 800, color: t.titleColor, margin: 0, letterSpacing: "-0.02em" }}>{t.title}</p>
          <p style={{ fontSize: 12, color: t.subColor, margin: "4px 0 0", letterSpacing: "0.04em" }}>{t.subtitle}</p>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: t.labelColor }}>이메일</label>
        <input
          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, color: t.inputColor, background: t.inputBg, width: "100%", boxSizing: "border-box" }}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <label style={{ fontSize: 12, fontWeight: 700, color: t.labelColor }}>비밀번호</label>
        <input
          style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, color: t.inputColor, background: t.inputBg, width: "100%", boxSizing: "border-box" }}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        {(err || extraError) && (
          <div style={{ fontSize: 12, color: mode === "admin" ? "#ff8e84" : C.seal, fontWeight: 600 }}>
            {err || extraError}
          </div>
        )}

        <button
          style={{ border: "none", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, color: t.btnColor, background: t.btnBg, marginTop: 4, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          type="submit"
          disabled={busy}
        >
          {busy ? "로그인 중…" : "로그인"}
        </button>

        <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: t.subColor }}>
          {t.crossText}{" "}
          <a href={t.crossHref} style={{ color: t.linkColor, fontWeight: 700, textDecoration: "none" }}>{t.crossLabel}</a>
        </div>
      </form>
    </div>
  );
}

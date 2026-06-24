import { useState } from "react";
import { C, S } from "../styles.js";
import { getDeviceId } from "../utils/device.js";
import * as api from "../api/client.js";

const MODE_CONFIG = {
  admin: { title: "관리자 로그인", badge: "관리자·인사팀 전용", badgeColor: "#2d4a7a" },
  worker: { title: "근태 관리", badge: null },
};

export default function Login({ onLogin, mode = "worker", extraError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const config = MODE_CONFIG[mode] || MODE_CONFIG.worker;

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 20 }}>
      <form style={{ ...S.loginCard, width: "100%", maxWidth: 360 }} onSubmit={submit}>
        {config.badge && (
          <div style={{ background: config.badgeColor, color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, display: "inline-block", marginBottom: 12, letterSpacing: 0.5 }}>
            {config.badge}
          </div>
        )}
        <p style={{ ...S.h1, textAlign: "center", marginBottom: 20 }}>{config.title}</p>

        <label style={S.fieldLabel}>이메일</label>
        <input
          style={S.input}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <label style={S.fieldLabel}>비밀번호</label>
        <input
          style={S.input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />

        {(err || extraError) && <div style={S.err}>{err || extraError}</div>}

        <button style={{ ...S.primary, marginTop: 4, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
          {busy ? "로그인 중…" : "로그인"}
        </button>

        {mode === "worker" && (
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: C.inkSoft }}>
            관리자이신가요?{" "}
            <a href="/admin" style={{ color: C.ink, fontWeight: 700 }}>관리자 페이지</a>
          </div>
        )}
        {mode === "admin" && (
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: C.inkSoft }}>
            직원 출퇴근 화면은{" "}
            <a href="/" style={{ color: C.ink, fontWeight: 700 }}>여기</a>
          </div>
        )}
      </form>
    </div>
  );
}

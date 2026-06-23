import { useState } from "react";
import { C, S } from "../styles.js";
import { getDeviceId } from "../utils/device.js";
import * as api from "../api/client.js";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
        <p style={{ ...S.h1, textAlign: "center", marginBottom: 20 }}>근태 관리</p>
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
        {err && <div style={S.err}>{err}</div>}
        <button style={{ ...S.primary, marginTop: 4, opacity: busy ? 0.6 : 1 }} type="submit" disabled={busy}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}

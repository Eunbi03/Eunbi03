import { useState } from "react";
import { C, S } from "../styles.js";
import { getLocation } from "../utils/device.js";
import * as api from "../api/client.js";

export default function RandomCheckModal({ check, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const loc = await getLocation();
      await api.submitRandomCheck(check.id, loc);
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const remaining = Math.max(0, Math.floor((new Date(check.deadline) - Date.now()) / 1000 / 60));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,36,48,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
      <div style={{ ...S.loginCard, maxWidth: 360, width: "100%", margin: 0, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
        <p style={{ ...S.h1, marginBottom: 4 }}>위치 확인 요청</p>
        <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 4 }}>
          현재 위치를 확인해주세요.
        </p>
        <p style={{ fontSize: 12, color: C.seal, fontWeight: 700, marginBottom: 16 }}>
          {remaining}분 이내에 응답해주세요
        </p>
        {err && <div style={S.err}>{err}</div>}
        <button
          style={{ ...S.primary, opacity: busy ? 0.6 : 1, fontSize: 15 }}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "위치 확인 중…" : "현재 위치 제출"}
        </button>
      </div>
    </div>
  );
}

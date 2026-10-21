import { useState, useEffect } from "react";
import { getDeviceId } from "../utils/device.js";
import * as api from "../api/client.js";

// 관리자 기기 등록 링크(/admin/register-device?t=...) 처리 페이지.
// 링크를 '등록하려는 기기'에서 열면 이 화면이 그 기기를 관리자 기기로 등록한다.
export default function RegisterDevice() {
  const [state, setState] = useState("loading"); // loading | success | already | used | error
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const t = params.get("t");
        if (!t) { setState("error"); setMsg("잘못된 접근입니다. 등록 링크를 다시 확인해주세요."); return; }
        const deviceId = await getDeviceId();
        const r = await api.registerDeviceLink(t, deviceId);
        if (r.alreadyRegistered) { setState("already"); return; }
        if (r.alreadyUsed) { setState("used"); return; }
        setName(r.managerName || "");
        setState("success");
      } catch (e) {
        setState("error");
        setMsg(e.message || "기기 등록 중 오류가 발생했습니다.");
      }
    })();
  }, []);

  const box = {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#070a10", padding: "max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))",
  };
  const card = {
    width: "100%", maxWidth: 360, background: "#1e2536", border: "1px solid #39435a",
    borderRadius: 18, padding: "32px 24px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  };
  const btn = {
    border: "none", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700,
    color: "#fff", background: "#2d6cdf", cursor: "pointer", marginTop: 18, width: "100%",
  };

  return (
    <div style={box}>
      <div style={card}>
        {state === "loading" && (
          <>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>기기 등록 중…</p>
            <p style={{ fontSize: 13, color: "#8b94a8", margin: "10px 0 0" }}>잠시만 기다려주세요.</p>
          </>
        )}
        {state === "success" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>기기가 등록되었습니다</p>
            <p style={{ fontSize: 14, color: "#aab3c5", margin: "12px 0 0", lineHeight: 1.6 }}>
              {name ? `${name}님, ` : ""}이제 관리자 계정으로 로그인하여 사용할 수 있습니다.
            </p>
            <button style={btn} onClick={() => { window.location.href = "/admin"; }}>관리자 로그인으로</button>
          </>
        )}
        {state === "already" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>ℹ️</div>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>이미 등록된 기기입니다.</p>
            <button style={btn} onClick={() => { window.location.href = "/admin"; }}>관리자 로그인으로</button>
          </>
        )}
        {state === "used" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>ℹ️</div>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>이미 사용된 링크입니다.</p>
            <p style={{ fontSize: 14, color: "#aab3c5", margin: "12px 0 0", lineHeight: 1.6 }}>이 등록 링크로는 이미 기기가 등록되었습니다. 추가 기기가 필요하면 권한자에게 새 링크를 요청하세요.</p>
            <button style={btn} onClick={() => { window.location.href = "/admin"; }}>관리자 로그인으로</button>
          </>
        )}
        {state === "error" && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#ff8e84", margin: 0 }}>등록 실패</p>
            <p style={{ fontSize: 14, color: "#aab3c5", margin: "12px 0 0", lineHeight: 1.6 }}>{msg}</p>
          </>
        )}
      </div>
    </div>
  );
}

import { C, S } from "../styles.js";
import * as api from "../api/client.js";

const ROLE_CONFIG = {
  worker: { label: "직원", bg: C.ink },
  admin:  { label: "관리자", bg: "#0e6ca5" },
  hr:     { label: "인적자원팀", bg: "#0e6ca5" },
};

export default function Header({ user, onLogout }) {
  const config = ROLE_CONFIG[user?.role] || ROLE_CONFIG.worker;
  const logout = () => { api.logout(); onLogout(); };

  // 근로자 화면: 왼쪽 이름 / 오른쪽 로그아웃, 배경 #333333
  if (user?.role === "worker") {
    return (
      <div style={{ background: "#333333", color: "#fff", padding: "14px clamp(14px, 4vw, 48px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</span>
        <button
          onClick={logout}
          style={{ background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.55)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", flexShrink: 0 }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: config.bg, color: "#fff", padding: "12px clamp(14px, 4vw, 48px)", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5, color: "#fff" }}>근태 관리</span>
          {user?.role !== "worker" && (
            <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: "rgba(255,255,255,0.2)", color: "#fff", letterSpacing: 0.5 }}>
              {config.label}
            </span>
          )}
        </div>
        {user && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
          </div>
        )}
      </div>
      <button
        onClick={logout}
        style={{ background: "rgba(255,255,255,0.25)", border: "2px solid rgba(255,255,255,0.6)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 800, color: "#ffffff", cursor: "pointer", flexShrink: 0, letterSpacing: 0 }}
      >
        로그아웃
      </button>
    </div>
  );
}

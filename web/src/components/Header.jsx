import { C, S } from "../styles.js";
import * as api from "../api/client.js";

const ROLE_CONFIG = {
  worker: { label: "직원", bg: C.ink },
  admin:  { label: "관리자", bg: "#2d4a7a" },
  hr:     { label: "인사팀", bg: "#4a2d7a" },
};

export default function Header({ user, onLogout }) {
  const config = ROLE_CONFIG[user?.role] || ROLE_CONFIG.worker;

  const logout = () => {
    api.logout();
    onLogout();
  };

  return (
    <div style={{ background: config.bg, color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5 }}>근태 관리</span>
          {/* 관리자/인사팀에게만 역할 뱃지 강조 표시 */}
          {user?.role !== "worker" && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 7px",
              borderRadius: 20, background: "rgba(255,255,255,0.2)",
              letterSpacing: 0.5,
            }}>
              {config.label}
            </span>
          )}
        </div>
        {user && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.name}
            {user.role === "worker" && <span style={{ marginLeft: 4 }}>· {config.label}</span>}
          </div>
        )}
      </div>
      <button
        style={{ ...S.miniBtn, color: "#fff", borderColor: "rgba(255,255,255,0.3)", fontSize: 12, padding: "4px 10px", flexShrink: 0 }}
        onClick={logout}
      >
        로그아웃
      </button>
    </div>
  );
}

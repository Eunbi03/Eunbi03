import { C, S } from "../styles.js";
import * as api from "../api/client.js";

export default function Header({ user, onLogout }) {
  const roleLabel = { worker: "직원", admin: "관리자", hr: "인사팀" }[user?.role] || user?.role;

  const logout = () => {
    api.logout();
    onLogout();
  };

  return (
    <div style={{ background: C.ink, color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5 }}>근태 관리</span>
        {user && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginLeft: 10 }}>
            {user.name} · {roleLabel}
          </span>
        )}
      </div>
      <button
        style={{ ...S.miniBtn, color: "#fff", borderColor: "rgba(255,255,255,0.3)", fontSize: 12, padding: "4px 10px" }}
        onClick={logout}
      >
        로그아웃
      </button>
    </div>
  );
}

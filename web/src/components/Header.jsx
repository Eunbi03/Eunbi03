import { useEffect, useState } from "react";
import { C, S } from "../styles.js";
import * as api from "../api/client.js";

const ROLE_CONFIG = {
  worker: { label: "직원", bg: C.ink },
  admin:  { label: "관리자", bg: "#0e6ca5" },
  hr:     { label: "인적자원팀", bg: "#0e6ca5" },
};

// 역할+범위 → 상단 라벨 배지 텍스트 배열 (권한자/OO본부장/OO팀장/인적자원팀/일반)
function headerBadges(p) {
  if (!p) return [];
  if (p.isAuthorityHolder) return ["권한자"];
  const roles = p.roles || [];
  const out = [];
  if (roles.includes("director")) {
    const ds = (p.scopeDivisions || []);
    if (ds.length) ds.forEach((d) => out.push(d.endsWith("장") ? d : d + "장"));
    else out.push("본부장");
  }
  if (roles.includes("teamlead")) {
    const ts = (p.scopeTeams || []).filter((t) => t && t !== "전체");
    if (ts.length) ts.forEach((t) => out.push(t.endsWith("장") ? t : t + "장"));
    else out.push("팀장");
  }
  if (roles.includes("hr")) out.push("인적자원팀");
  if (roles.includes("general")) out.push("일반");
  // 역할이 없으면 보류(열람 불가) 상태
  return out.length ? out : ["보류"];
}

export default function Header({ user, onLogout }) {
  const config = ROLE_CONFIG[user?.role] || ROLE_CONFIG.worker;
  const logout = () => { api.logout(); onLogout(); };

  // 관리자: 최신 역할·범위로 라벨 표시(권한자/OO본부장/OO팀장/인적자원팀/일반)
  const [perm, setPerm] = useState(null);
  useEffect(() => {
    if (user && user.role !== "worker") {
      api.getMyPerms().then(setPerm).catch(() => {});
    }
  }, [user?.role]);
  const badges = headerBadges(perm);

  // 근로자 화면: 왼쪽 이름 / 오른쪽 로그아웃, 배경 #333333
  if (user?.role === "worker") {
    return (
      <div style={{ background: "#333333", color: "#fff", padding: "calc(14px + env(safe-area-inset-top)) clamp(14px, 4vw, 48px) 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
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
    <div style={{ background: config.bg, color: "#fff", padding: "calc(12px + env(safe-area-inset-top)) clamp(14px, 4vw, 48px) 12px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.5, color: "#fff" }}>근태 관리</span>
          {user?.role !== "worker" && (badges.length ? badges : [config.label]).map((b, i) => (
            <span key={i} style={{ fontSize: 13, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: "rgba(255,255,255,0.2)", color: "#fff", letterSpacing: 0.5 }}>
              {b}
            </span>
          ))}
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

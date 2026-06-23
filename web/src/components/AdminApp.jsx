import { useState } from "react";
import { C, S } from "../styles.js";
import AdminDashboard from "./admin/AdminDashboard.jsx";
import AdminToday from "./admin/AdminToday.jsx";
import AdminStaff from "./admin/AdminStaff.jsx";
import AdminMonth from "./admin/AdminMonth.jsx";
import AdminSettings from "./admin/AdminSettings.jsx";

const TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "today", label: "오늘 현황" },
  { key: "staff", label: "직원 관리" },
  { key: "month", label: "월별 리포트" },
  { key: "settings", label: "설정" },
];

export default function AdminApp({ user }) {
  const isHR = user?.role === "hr";
  const [tab, setTab] = useState("dashboard");
  const [corp, setCorp] = useState("");
  const [team, setTeam] = useState("");

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 0 40px" }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            style={{
              ...S.miniBtn,
              flexShrink: 0,
              fontWeight: tab === t.key ? 700 : 400,
              background: tab === t.key ? C.ink : "transparent",
              color: tab === t.key ? "#fff" : C.ink,
              borderColor: tab === t.key ? C.ink : C.line,
              padding: "6px 14px",
              fontSize: 13,
            }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "dashboard" && tab !== "settings" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input
            style={{ ...S.input, flex: 1, padding: "7px 10px", fontSize: 12 }}
            placeholder="법인 필터"
            value={corp}
            onChange={(e) => setCorp(e.target.value)}
          />
          <input
            style={{ ...S.input, flex: 1, padding: "7px 10px", fontSize: 12 }}
            placeholder="팀 필터"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          />
        </div>
      )}

      {tab === "dashboard" && <AdminDashboard corp={corp} team={team} />}
      {tab === "today" && <AdminToday corp={corp} team={team} />}
      {tab === "staff" && <AdminStaff corp={corp} team={team} isHR={isHR} />}
      {tab === "month" && <AdminMonth corp={corp} team={team} />}
      {tab === "settings" && <AdminSettings />}
    </div>
  );
}

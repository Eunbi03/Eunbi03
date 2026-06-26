import { useState, useEffect } from "react";
import { C, S } from "../styles.js";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [breakpoint]);
  return isMobile;
}
import AdminOverall from "./admin/AdminOverall.jsx";
import AdminStaff from "./admin/AdminStaff.jsx";
import AdminIndividual from "./admin/AdminIndividual.jsx";
import AdminSettings from "./admin/AdminSettings.jsx";
import * as api from "../api/client.js";

const TABS = [
  { key: "overall",    label: "전체 현황" },
  { key: "staff",      label: "직원 관리" },
  { key: "individual", label: "개별 리포트" },
  { key: "settings",   label: "설정" },
];

export default function AdminApp({ user }) {
  const isMobile = useIsMobile();
  const isHR = user?.role === "hr" || user?.role === "admin";
  const [tab, setTab] = useState("overall");

  // 공통 필터: 직원 목록에서 동적으로 추출
  const [filterOptions, setFilterOptions] = useState({ corps: [], divisions: [], teams: [] });
  const [filters, setFilters] = useState({ corp: "", division: "", team: "" });

  useEffect(() => {
    api.getWorkers({}).then((d) => {
      const corps     = [...new Set(d.workers.map((w) => w.corp).filter(Boolean))].sort();
      const divisions = [...new Set(d.workers.map((w) => w.division).filter(Boolean))].sort();
      const teams     = [...new Set(d.workers.map((w) => w.team).filter(Boolean))].sort();
      setFilterOptions({ corps, divisions, teams });
    }).catch(() => {});
  }, []);

  const setF = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  const showFilter = tab !== "settings";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 0 60px" }}>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "12px 0 6px", borderBottom: `1px solid ${C.lineAdmin}`, marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.key}
            style={{ flexShrink: 0, border: "none", borderRadius: 8, padding: isMobile ? "7px 16px" : "8px 20px", fontSize: isMobile ? 13 : 15, fontWeight: tab === t.key ? 800 : 400,
              background: tab === t.key ? C.ink : "transparent", color: tab === t.key ? "#fff" : C.inkSoft, cursor: "pointer" }}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* 필터 */}
      {showFilter && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <select style={{ ...S.select, flex: "1 1 100px", padding: isMobile ? "7px 10px" : "9px 12px", fontSize: isMobile ? 12 : 14, borderColor: C.lineAdmin }} value={filters.corp} onChange={(e) => setF("corp", e.target.value)}>
            <option value="">전체 법인</option>
            {filterOptions.corps.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...S.select, flex: "1 1 100px", padding: isMobile ? "7px 10px" : "9px 12px", fontSize: isMobile ? 12 : 14, borderColor: C.lineAdmin }} value={filters.division} onChange={(e) => setF("division", e.target.value)}>
            <option value="">전체 본부</option>
            {filterOptions.divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select style={{ ...S.select, flex: "1 1 100px", padding: isMobile ? "7px 10px" : "9px 12px", fontSize: isMobile ? 12 : 14, borderColor: C.lineAdmin }} value={filters.team} onChange={(e) => setF("team", e.target.value)}>
            <option value="">전체 팀</option>
            {filterOptions.teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {tab === "overall"    && <AdminOverall    filters={filters} />}
      {tab === "staff"      && <AdminStaff      filters={filters} isHR={isHR} currentUser={user} onRefreshFilters={() => {}} />}
      {tab === "individual" && <AdminIndividual filters={filters} />}
      {tab === "settings"   && <AdminSettings />}
    </div>
  );
}

import { useState, useEffect } from "react";
import { C, S } from "../styles.js";
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
  const isHR = user?.role === "hr" || user?.role === "admin";
  const [tab, setTab] = useState("overall");

  // 공통 필터: 직원 목록에서 동적으로 추출
  const [filterOptions, setFilterOptions] = useState({ corps: [], teams: [], jobTitles: [] });
  const [filters, setFilters] = useState({ corp: "", team: "", jobTitle: "" });

  useEffect(() => {
    api.getWorkers({}).then((d) => {
      const corps    = [...new Set(d.workers.map((w) => w.corp).filter(Boolean))].sort();
      const teams    = [...new Set(d.workers.map((w) => w.team).filter(Boolean))].sort();
      const jobTitles= [...new Set(d.workers.map((w) => w.job_title).filter(Boolean))].sort();
      setFilterOptions({ corps, teams, jobTitles });
    }).catch(() => {});
  }, []);

  const setF = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  const showFilter = tab !== "settings";

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 0 60px" }}>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "12px 0 6px", borderBottom: `1px solid ${C.line}`, marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.key}
            style={{ flexShrink: 0, border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: tab === t.key ? 800 : 400,
              background: tab === t.key ? C.ink : "transparent", color: tab === t.key ? "#fff" : C.inkSoft, cursor: "pointer" }}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* 필터 */}
      {showFilter && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <select style={{ ...S.select, flex: "1 1 120px", padding: "7px 10px", fontSize: 12 }} value={filters.corp} onChange={(e) => setF("corp", e.target.value)}>
            <option value="">전체 법인</option>
            {filterOptions.corps.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...S.select, flex: "1 1 120px", padding: "7px 10px", fontSize: 12 }} value={filters.team} onChange={(e) => setF("team", e.target.value)}>
            <option value="">전체 팀</option>
            {filterOptions.teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={{ ...S.select, flex: "1 1 120px", padding: "7px 10px", fontSize: 12 }} value={filters.jobTitle} onChange={(e) => setF("jobTitle", e.target.value)}>
            <option value="">전체 직무</option>
            {filterOptions.jobTitles.map((j) => <option key={j} value={j}>{j}</option>)}
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

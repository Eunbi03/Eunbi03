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
  // HR 전용 작업(비밀번호/기기 초기화, 근무지·연차·공휴일 관리 등)은 hr 역할만 노출 — 백엔드 requireHR과 일치
  const isHR = user?.role === "hr";
  const [tab, setTab] = useState("overall");

  // 공통 필터: 설정의 조직 마스터 데이터 기반 (법인/본부·팀/직위)
  const [corps, setCorps] = useState([]);          // [name]
  const [divisions, setDivisions] = useState([]);  // [{name, teams:[{name}]}]
  const [positions, setPositions] = useState([]);  // [name]
  const [filters, setFilters] = useState({ corp: "", division: "", team: "", position: "" });

  useEffect(() => {
    api.getCorporations().then((d) => setCorps((d.corporations || []).map((c) => c.name))).catch(() => {});
    api.getDivisions().then((d) => setDivisions(d.divisions || [])).catch(() => {});
    api.getPositions().then((d) => setPositions((d.positions || []).map((p) => p.name))).catch(() => {});
  }, []);

  // 팀→본부 매핑 (팀 선택 시 본부 자동 지정)
  const teamToDivision = {};
  divisions.forEach((d) => (d.teams || []).forEach((t) => { teamToDivision[t.name] = d.name; }));
  // 팀 후보: 본부 선택 시 해당 본부의 팀만, 아니면 전체
  const teamOptions = filters.division
    ? ((divisions.find((d) => d.name === filters.division)?.teams) || []).map((t) => t.name)
    : divisions.flatMap((d) => (d.teams || []).map((t) => t.name));

  const setF = (key, val) => {
    setFilters((f) => {
      const next = { ...f, [key]: val };
      if (key === "team" && val) next.division = teamToDivision[val] || f.division; // 팀→본부 자동
      if (key === "division") next.team = ""; // 본부 바꾸면 팀 초기화
      return next;
    });
  };

  const showFilter = tab !== "settings";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 0 60px" }}>
      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "12px 0 6px", borderBottom: `1px solid ${C.lineAdmin}`, marginBottom: 12 }}>
        {TABS.filter((t) => t.key !== "settings" || isHR).map((t) => (
          <button key={t.key}
            style={{ flexShrink: 0, border: "none", borderRadius: 8, padding: isMobile ? "7px 16px" : "8px 20px", fontSize: isMobile ? 13 : 15, fontWeight: tab === t.key ? 800 : 400,
              background: tab === t.key ? "#2f6d8f" : "transparent", color: tab === t.key ? "#fff" : C.inkSoft, cursor: "pointer" }}
            onClick={() => setTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* 필터: 법인 / 본부 / 팀 / 직위 */}
      {showFilter && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {(() => {
            const sel = { ...S.select, flex: "1 1 100px", padding: isMobile ? "7px 10px" : "9px 12px", fontSize: isMobile ? 12 : 14, borderColor: C.lineAdmin };
            return (
              <>
                <select style={sel} value={filters.corp} onChange={(e) => setF("corp", e.target.value)}>
                  <option value="">전체 법인</option>
                  {corps.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select style={sel} value={filters.division} onChange={(e) => setF("division", e.target.value)}>
                  <option value="">전체 본부</option>
                  {divisions.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
                <select style={sel} value={filters.team} onChange={(e) => setF("team", e.target.value)}>
                  <option value="">전체 팀</option>
                  {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select style={sel} value={filters.position} onChange={(e) => setF("position", e.target.value)}>
                  <option value="">전체 직위</option>
                  {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </>
            );
          })()}
        </div>
      )}

      {tab === "overall"    && <AdminOverall    filters={filters} />}
      {tab === "staff"      && <AdminStaff      filters={filters} isHR={isHR} currentUser={user} onRefreshFilters={() => {}} />}
      {tab === "individual" && <AdminIndividual filters={filters} isHR={isHR} />}
      {tab === "settings"   && isHR && <AdminSettings />}
    </div>
  );
}

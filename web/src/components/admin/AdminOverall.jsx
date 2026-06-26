import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [breakpoint]);
  return isMobile;
}

function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); }
function monthStart() { return todayStr().slice(0, 7) + "-01"; }

export default function AdminOverall({ filters }) {
  const isMobile = useIsMobile();
  const today = todayStr();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getOverview({ from, to }).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [from, to]);

  const filterWorker = (w) => {
    if (filters.corp     && w.corp     !== filters.corp)     return false;
    if (filters.division && w.division !== filters.division) return false;
    if (filters.team     && w.team     !== filters.team)     return false;
    return true;
  };

  // 법인 → 본부 → 팀 계층 구조로 변환
  const buildHierarchy = () => {
    if (!data?.teams) return {};
    const corps = {};
    for (const team of data.teams) {
      const members = team.members.filter(filterWorker);
      if (!members.length) continue;
      const corp     = team.corp     || "(미지정)";
      const division = team.division || "(미지정)";
      const teamName = team.team     || "(미지정)";
      if (!corps[corp]) corps[corp] = {};
      if (!corps[corp][division]) corps[corp][division] = {};
      corps[corp][division][teamName] = members;
    }
    return corps;
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  const hierarchy = buildHierarchy();
  const corpEntries = Object.entries(hierarchy);

  return (
    <div>
      {/* 기간 설정 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: isMobile ? 12 : 14, color: C.inkSoft, fontWeight: 700 }}>기간</span>
        <input type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)}
          style={{ ...S.input, padding: "6px 10px", fontSize: isMobile ? 12 : 14, flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: isMobile ? 12 : 14, color: C.inkSoft }}>~</span>
        <input type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)}
          style={{ ...S.input, padding: "6px 10px", fontSize: isMobile ? 12 : 14, flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: isMobile ? 11 : 13, color: C.inkSoft }}>근무일 {data?.period?.workdays ?? "—"}일</span>
      </div>

      {!corpEntries.length && <div style={S.empty}>직원 데이터가 없습니다.</div>}

      {corpEntries.map(([corp, divisions]) => (
        <div key={corp} style={{ marginBottom: 20 }}>
          {/* 법인 헤더 */}
          <div style={{
            textAlign: "center", fontWeight: 800, fontSize: isMobile ? 15 : 19, color: C.blue,
            background: C.blueSoft, borderRadius: 12, padding: "10px 16px", marginBottom: 10,
          }}>
            {corp}
          </div>

          {Object.entries(divisions).map(([division, teams]) => (
            <div key={division} style={{ marginBottom: 8 }}>
              {/* 본부 헤더 */}
              <p style={{ fontWeight: 800, fontSize: isMobile ? 13 : 17, color: C.ink, margin: "0 0 4px 2px" }}>
                &gt; {division}
              </p>

              {Object.entries(teams).map(([teamName, members]) => {
                const violators = members.filter((m) => m.score >= 5);
                return (
                  <div key={teamName} style={{ marginLeft: 10, marginBottom: 12 }}>
                    {/* 팀 헤더 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                      <p style={{ fontWeight: 700, fontSize: isMobile ? 12 : 14, color: C.inkSoft, margin: 0 }}>
                        &gt; {teamName}
                      </p>
                      {violators.length > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.seal, background: C.sealSoft, padding: "2px 8px", borderRadius: 12 }}>
                          관리대상 {violators.length}명
                        </span>
                      )}
                    </div>

                    {/* 테이블 */}
                    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 52px 52px 52px", padding: "6px 12px", background: C.paper, fontSize: isMobile ? 11 : 15, fontWeight: 700, color: C.inkSoft }}>
                        <span>이름</span>
                        <span style={{ textAlign: "center" }}>지각</span>
                        <span style={{ textAlign: "center" }}>출근누락</span>
                        <span style={{ textAlign: "center" }}>퇴근누락</span>
                        <span style={{ textAlign: "center" }}>노트누락</span>
                      </div>
                      {members.map((m) => {
                        const over = m.score >= 5;
                        return (
                          <div key={m.id} style={{
                            display: "grid", gridTemplateColumns: "1fr 52px 52px 52px 52px",
                            padding: "7px 12px", borderTop: `1px solid ${C.line}`,
                            background: over ? "#fff5f5" : "#fff",
                          }}>
                            <span style={{ fontSize: isMobile ? 13 : 17, fontWeight: over ? 700 : 400, color: over ? C.seal : C.ink }}>
                              {m.name}
                            </span>
                            <Cell v={m.lateCount} over={over} isMobile={isMobile} />
                            <Cell v={m.missingIn} over={over} isMobile={isMobile} />
                            <Cell v={m.missingOut} over={over} isMobile={isMobile} />
                            <Cell v={m.missingNote} over={over} isMobile={isMobile} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Cell({ v, over, isMobile }) {
  return (
    <span style={{ textAlign: "center", fontSize: isMobile ? 13 : 17, fontWeight: v > 0 ? 700 : 400, color: v > 0 && over ? C.seal : v > 0 ? C.amber : C.inkSoft }}>
      {v || "-"}
    </span>
  );
}

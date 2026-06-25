import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import * as api from "../../api/client.js";

function todayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); }
function monthStart() { return todayStr().slice(0, 7) + "-01"; }

export default function AdminOverall({ filters }) {
  const today = todayStr();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getOverview({ from, to }).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [from, to]);

  const filterWorker = (w) => {
    if (filters.corp && w.corp !== filters.corp) return false;
    if (filters.team && w.team !== filters.team) return false;
    if (filters.jobTitle && w.job_title !== filters.jobTitle) return false;
    return true;
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;

  return (
    <div>
      {/* 기간 설정 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 700 }}>기간</span>
        <input type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)}
          style={{ ...S.input, padding: "6px 10px", fontSize: 12, flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: 12, color: C.inkSoft }}>~</span>
        <input type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)}
          style={{ ...S.input, padding: "6px 10px", fontSize: 12, flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: 11, color: C.inkSoft }}>근무일 {data?.period?.workdays ?? "—"}일</span>
      </div>

      {!data?.teams?.length && <div style={S.empty}>직원 데이터가 없습니다.</div>}

      {data?.teams?.map((team) => {
        const members = team.members.filter(filterWorker);
        if (!members.length) return null;
        const violators = members.filter((m) => m.total > 5);

        return (
          <div key={team.label} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <p style={{ fontWeight: 800, fontSize: 14, color: C.ink, margin: 0 }}>{team.label}</p>
              <span style={{ fontSize: 12, color: C.inkSoft }}>총 {members.length}명</span>
              {violators.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.seal, background: C.sealSoft, padding: "2px 8px", borderRadius: 12 }}>
                  5회 초과 {violators.length}명
                </span>
              )}
            </div>

            <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              {/* 헤더 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px 60px", gap: 4, padding: "7px 12px", background: C.paper, fontSize: 11, fontWeight: 700, color: C.inkSoft }}>
                <span>이름</span>
                <span style={{ textAlign: "center" }}>지각</span>
                <span style={{ textAlign: "center" }}>출근누락</span>
                <span style={{ textAlign: "center" }}>퇴근누락</span>
                <span style={{ textAlign: "center" }}>노트누락</span>
              </div>

              {members.map((m) => {
                const over = m.total > 5;
                return (
                  <div key={m.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 60px 60px 60px 60px", gap: 4,
                    padding: "8px 12px", borderTop: `1px solid ${C.line}`,
                    background: over ? "#fff5f5" : "#fff",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: over ? 700 : 400, color: over ? C.seal : C.ink }}>
                      {m.name}
                      {m.job_title && <span style={{ fontSize: 11, color: C.inkSoft, marginLeft: 4 }}>{m.job_title}</span>}
                    </span>
                    <Cell v={m.lateCount} over={over} />
                    <Cell v={m.missingIn} over={over} />
                    <Cell v={m.missingOut} over={over} />
                    <Cell v={m.missingNote} over={over} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cell({ v, over }) {
  return (
    <span style={{ textAlign: "center", fontSize: 13, fontWeight: v > 0 ? 700 : 400, color: v > 0 && over ? C.seal : v > 0 ? C.amber : C.inkSoft }}>
      {v || "-"}
    </span>
  );
}

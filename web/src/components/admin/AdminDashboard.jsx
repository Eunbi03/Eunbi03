import { useState, useEffect, useRef } from "react";
import { C, S } from "../../styles.js";
import { Kpi } from "../Small.jsx";
import * as api from "../../api/client.js";

const CHART_W = 40;
const CHART_GAP = 8;
const CHART_H = 80;

function BarChart({ data }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(1, ...data.map((d) => d.checked_in || 0));

  return (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: CHART_GAP, minWidth: data.length * (CHART_W + CHART_GAP) }}>
        {data.map((d, i) => {
          const h = Math.max(4, Math.round(((d.checked_in || 0) / maxVal) * CHART_H));
          const lateH = d.late ? Math.round((d.late / maxVal) * CHART_H) : 0;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ fontSize: 9, color: C.inkSoft }}>{d.checked_in || 0}</div>
              <div style={{ width: CHART_W, height: CHART_H, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", position: "relative" }}>
                  <div style={{ width: "100%", height: h, background: C.green, borderRadius: "4px 4px 0 0" }} />
                  {lateH > 0 && (
                    <div style={{ position: "absolute", bottom: 0, width: "100%", height: lateH, background: C.amber, borderRadius: "4px 4px 0 0", opacity: 0.8 }} />
                  )}
                </div>
              </div>
              <div style={{ fontSize: 9, color: C.inkSoft, whiteSpace: "nowrap" }}>
                {String(d.date || "").slice(5, 10)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: C.inkSoft }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.green, borderRadius: 2, marginRight: 3 }} />출근</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.amber, borderRadius: 2, marginRight: 3 }} />지각</span>
      </div>
    </div>
  );
}

export default function AdminDashboard({ corp, team }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const load = async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 300_000); // 5분마다 자동 갱신
    return () => clearInterval(timerRef.current);
  }, []);

  if (loading) return <div style={S.empty}>불러오는 중…</div>;
  if (!data) return <div style={S.empty}>데이터를 불러오지 못했습니다.</div>;

  const today = data.today || {};

  return (
    <div>
      <div style={S.kpiRow}>
        <Kpi label="전체 직원" value={data.totalStaff} color={C.ink} />
        <Kpi label="출근" value={today.checked_in || 0} color={C.green} />
        <Kpi label="지각" value={today.late || 0} color={C.amber} />
        <Kpi label="퇴근" value={today.checked_out || 0} color={C.inkSoft} />
      </div>

      <div style={{ ...S.formCard, marginTop: 0 }}>
        <p style={S.formTitle}>이번 주 출근 현황</p>
        <BarChart data={data.weeklyChart} />
      </div>
    </div>
  );
}

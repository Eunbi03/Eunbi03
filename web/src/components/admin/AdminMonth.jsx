import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import { fmtTime, fmtDur } from "../../utils/format.js";
import { Kpi } from "../Small.jsx";
import * as api from "../../api/client.js";

export default function AdminMonth({ corp, team }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [workers, setWorkers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  useEffect(() => {
    setListLoading(true);
    api.getWorkers({ corp: corp || "", team: team || "" })
      .then((d) => { setWorkers(d.workers); if (d.workers.length > 0) setSelectedId(String(d.workers[0].id)); })
      .finally(() => setListLoading(false));
  }, [corp, team]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api.getMonthlyReports({ userId: selectedId, year, month })
      .then((d) => setReport(d.report || null))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [selectedId, year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button style={S.miniBtn} onClick={prevMonth}>◀</button>
        <span style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{year}년 {month}월</span>
        <button style={S.miniBtn} onClick={nextMonth}>▶</button>
      </div>

      {listLoading ? (
        <div style={S.empty}>직원 목록 불러오는 중…</div>
      ) : (
        <select
          style={{ ...S.input, marginBottom: 14 }}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} {w.employee_id ? `#${w.employee_id}` : ""} ({w.corp} · {w.team})
            </option>
          ))}
        </select>
      )}

      {loading && <div style={S.empty}>불러오는 중…</div>}

      {!loading && report && (
        <div>
          {report.reprimandIssued && (
            <div style={{ background: C.sealSoft, borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: C.seal, fontWeight: 700, fontSize: 13 }}>
              이번 달 경고 조치가 발령되었습니다 (지각/조퇴 {report.lateCount}회)
            </div>
          )}

          <div style={S.kpiRow}>
            <Kpi label="근무일" value={report.workedDays ?? "—"} color={C.green} />
            <Kpi label="지각/조퇴" value={report.lateCount ?? 0} color={C.amber} />
            <Kpi label="결근" value={report.absentDays ?? 0} color={C.seal} />
            <Kpi label="총 근무" value={report.totalWorkMinutes ? fmtDur(report.totalWorkMinutes) : "—"} color={C.ink} />
          </div>

          {report.days && report.days.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {report.days.map((d, i) => (
                <div key={i} style={{ ...S.hrRow, padding: "8px 12px" }}>
                  <div style={{ width: 80, fontSize: 12, color: C.inkSoft, flexShrink: 0 }}>
                    {String(d.date).slice(5)}
                  </div>
                  <div style={{ flex: 1, fontSize: 13, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                    {fmtTime(d.check_in)} – {fmtTime(d.check_out)}
                    {d.work_minutes ? <span style={{ color: C.inkSoft, fontSize: 11, marginLeft: 6 }}>{fmtDur(d.work_minutes)}</span> : null}
                  </div>
                  {(d.is_late || d.is_early_leave) && (
                    <span style={{ ...S.badge, color: C.seal, background: C.sealSoft }}>
                      {d.is_late ? "지각" : ""}{d.is_late && d.is_early_leave ? "/" : ""}{d.is_early_leave ? "조퇴" : ""}
                    </span>
                  )}
                  {d.is_absent && (
                    <span style={{ ...S.badge, color: C.seal, background: C.sealSoft }}>결근</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {(!report.days || report.days.length === 0) && (
            <div style={S.empty}>이 달 기록이 없습니다.</div>
          )}
        </div>
      )}

      {!loading && !report && selectedId && (
        <div style={S.empty}>이 달 리포트가 없습니다.</div>
      )}
    </div>
  );
}

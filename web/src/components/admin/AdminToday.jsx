import { useState, useEffect } from "react";
import { C, S } from "../../styles.js";
import { fmtTime } from "../../utils/format.js";
import { Kpi } from "../Small.jsx";
import Timeline from "../Timeline.jsx";
import * as api from "../../api/client.js";

function statusBadgeStyle(record) {
  if (record.isLate || record.isEarlyLeave) return { color: C.seal, background: C.sealSoft };
  if (record.checkOut?.time) return { color: C.ink, background: C.line };
  if (record.checkIn?.time) return { color: C.green, background: C.greenSoft };
  return { color: C.inkSoft, background: C.line };
}

export default function AdminToday({ corp, team }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAttendanceByDate({ corp: corp || "", team: team || "" });
      setRecords(data.records);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [corp, team]);

  const handleTimeChange = async (recordId, userId, approve) => {
    setApproving(recordId);
    try {
      await api.approveTimeChange(recordId, approve);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setApproving(null);
    }
  };

  if (loading) return <div style={S.empty}>불러오는 중…</div>;
  if (error) return <div style={{ ...S.empty, color: C.seal }}>{error}</div>;

  const inN = records.filter((r) => r.checkIn?.time).length;
  const lateN = records.filter((r) => r.isLate).length;
  const outN = records.filter((r) => r.checkOut?.time).length;

  return (
    <div>
      <div style={S.kpiRow}>
        <Kpi label="출근" value={inN} color={C.green} />
        <Kpi label="지각/조퇴" value={lateN} color={C.amber} />
        <Kpi label="퇴근" value={outN} color={C.ink} />
        <Kpi label="전체" value={records.length} color={C.inkSoft} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {records.map((r) => {
          const badge = statusBadgeStyle(r);
          return (
            <div key={r.userId}>
              <div style={S.hrRow} onClick={() => setOpen(open === r.userId ? null : r.userId)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>
                    {r.name}
                    <span style={{ fontWeight: 400, color: C.inkSoft, fontSize: 12, marginLeft: 6 }}>
                      {r.corp} · {r.team}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", marginRight: 10 }}>
                  <div style={{ fontSize: 13, color: r.isLate || r.isEarlyLeave ? C.seal : C.ink, fontWeight: r.isLate || r.isEarlyLeave ? 800 : 400, fontVariantNumeric: "tabular-nums" }}>
                    {fmtTime(r.checkIn?.time)} – {fmtTime(r.checkOut?.time)}
                  </div>
                  <div style={{ fontSize: 11, color: C.inkSoft }}>이동 {r.outings?.length || 0}건</div>
                </div>
                <span style={{ ...S.badge, ...badge }}>{r.status || "출근 전"}</span>
              </div>

              {open === r.userId && r.checkIn?.time && (
                <div style={S.detail}>
                  <Timeline record={r} />

                  {r.timeChangeStatus === "pending" && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: C.amberSoft, borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.amber }}>
                        퇴근 시간 변경 요청: {r.timeChangeRequestedEnd?.slice(0, 5)}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <button
                          style={{ ...S.miniBtn, color: C.green, borderColor: C.greenSoft }}
                          disabled={approving === r.recordId}
                          onClick={() => handleTimeChange(r.recordId, r.userId, true)}
                        >승인</button>
                        <button
                          style={{ ...S.miniBtn, color: C.seal, borderColor: C.sealSoft }}
                          disabled={approving === r.recordId}
                          onClick={() => handleTimeChange(r.recordId, r.userId, false)}
                        >거부</button>
                      </div>
                    </div>
                  )}

                  {r.dailyReport && (
                    <div style={{ marginTop: 10 }}>
                      <div style={S.jRow}><span style={S.jTag}>오늘</span><span>{r.dailyReport}</span></div>
                      <div style={S.jRow}><span style={S.jTag}>내일</span><span>{r.tomorrowPlan || "—"}</span></div>
                    </div>
                  )}
                </div>
              )}
              {open === r.userId && !r.checkIn?.time && <div style={S.detailEmpty}>아직 출근 기록이 없습니다.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

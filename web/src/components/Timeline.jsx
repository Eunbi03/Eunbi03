import { C } from "../styles.js";
import { fmtTime, fmtDur } from "../utils/format.js";
import { mapUrl } from "../utils/device.js";

function dot(color) {
  return { width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 3 };
}

export default function Timeline({ record }) {
  const events = [];

  if (record.checkIn?.time) {
    events.push({ time: record.checkIn.time, label: "출근", color: C.green, loc: record.checkIn.location });
  }

  (record.outings || []).forEach((o) => {
    events.push({ time: o.startTime, label: `외출 (${o.destination || "—"})`, color: C.amber, loc: o.startLocation });
    if (o.endTime) events.push({ time: o.endTime, label: "복귀", color: C.inkSoft });
  });

  if (record.checkOut?.time) {
    events.push({ time: record.checkOut.time, label: "퇴근", color: C.ink, loc: record.checkOut.location });
  }

  events.sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={dot(ev.color)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>
              <span style={{ fontVariantNumeric: "tabular-nums", marginRight: 8 }}>{fmtTime(ev.time)}</span>
              {ev.label}
            </div>
            {ev.loc && (
              <a
                href={mapUrl(ev.loc.lat, ev.loc.lng)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: C.inkSoft, textDecoration: "underline" }}
              >
                지도 보기
              </a>
            )}
          </div>
        </div>
      ))}
      {record.checkIn?.time && record.checkOut?.time && record.workMinutes != null && (
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
          총 근무: {fmtDur(record.workMinutes)}
        </div>
      )}
    </div>
  );
}

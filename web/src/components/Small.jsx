import { C, S } from "../styles.js";

export function Kpi({ label, value, color }) {
  return (
    <div style={S.kpi}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.ink, fontVariantNumeric: "tabular-nums" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function Spinner() {
  return <div style={S.empty}>불러오는 중…</div>;
}

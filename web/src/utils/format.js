const pad = (n) => String(n).padStart(2, "0");

export const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDur = (minutes) =>
  !minutes ? "0시간" : `${Math.floor(minutes / 60)}시간${minutes % 60 ? " " + (minutes % 60) + "분" : ""}`;

export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

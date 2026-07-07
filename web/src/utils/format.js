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

// 전화번호를 하이픈 포함으로 표시 (010-1234-5678 / 02-123-4567 등). 입력의 하이픈 유무 무관.
export const fmtPhone = (raw) => {
  if (!raw) return "";
  const d = String(raw).replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("02")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return raw;
};

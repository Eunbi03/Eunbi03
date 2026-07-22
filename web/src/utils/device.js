async function sha256(str) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return "f" + (h >>> 0).toString(16);
  }
}

function deviceRaw() {
  const n = navigator;
  return [
    n.userAgent, n.platform, n.language, n.hardwareConcurrency,
    screen.width + "x" + screen.height + "x" + (window.devicePixelRatio || 1),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
}

// 기기 식별자는 최초 1회만 지문으로 계산해 저장하고, 이후로는 저장값을 그대로 재사용한다.
// (WebView/OS 자동 업데이트로 userAgent가 바뀌어도 기기가 바뀌지 않도록 — DEVICE_MISMATCH 재발 방지)
export async function getDeviceId() {
  try {
    const stored = localStorage.getItem("att::deviceId");
    if (stored) return stored;
  } catch { /* 무시 */ }
  const id = (await sha256("att::device::" + deviceRaw())).slice(0, 32);
  try { localStorage.setItem("att::deviceId", id); } catch { /* 무시 */ }
  return id;
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  let os = "기기";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iPhone/iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  let br = "브라우저";
  if (/Edg\//.test(ua)) br = "Edge";
  else if (/Chrome\//.test(ua)) br = "Chrome";
  else if (/Firefox\//.test(ua)) br = "Firefox";
  else if (/Safari\//.test(ua)) br = "Safari";
  return `${os} · ${br}`;
}

// 위치 수집은 Capacitor Geolocation 플러그인 사용
// (네이티브 앱에서는 실제 GPS + 런타임 권한 요청, 웹에서는 navigator.geolocation로 자동 대체)
import { Geolocation } from "@capacitor/geolocation";

let _watchId = null;
let _lastPos = null;
let _autoStopTimer = null;

// 위치 권한이 없으면 요청한다.
async function ensurePermission() {
  try {
    const s = await Geolocation.checkPermissions();
    if (s.location !== "granted" && s.coarseLocation !== "granted") {
      await Geolocation.requestPermissions();
    }
  } catch { /* 웹 등에서 무시 */ }
}

// 출근 중 GPS 상시 감지 (랜덤 위치 확인용).
// autoStopAtMs: 이 시각(타임스탬프, ms)이 되면 자동으로 감지를 종료한다.
//   (퇴근 버튼을 누르지 않아도 기본 퇴근시간+2시간에 GPS가 꺼지도록)
export async function startLocationWatch(autoStopAtMs = null) {
  // 자동 종료 예약(있으면 갱신)
  if (_autoStopTimer !== null) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
  if (typeof autoStopAtMs === "number") {
    const delay = autoStopAtMs - Date.now();
    // 이미 지난 시각이면(예: 기본 퇴근+2시간 이후 출근) 즉시 종료하지 않고 그냥 감지를 유지
    if (delay > 0) _autoStopTimer = setTimeout(() => { stopLocationWatch(); }, delay);
  }
  if (_watchId !== null) return; // 이미 감지 중이면 타이머만 갱신
  await ensurePermission();
  try {
    _watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      (p) => { if (p) _lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; }
    );
  } catch { /* 무시 */ }
}

export async function stopLocationWatch() {
  if (_autoStopTimer !== null) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
  if (_watchId !== null) {
    try { await Geolocation.clearWatch({ id: _watchId }); } catch { /* 무시 */ }
    _watchId = null; _lastPos = null;
  }
}

export async function checkLocationPermission() {
  try {
    const s = await Geolocation.checkPermissions();
    if (s.location === "granted" || s.coarseLocation === "granted") return "granted";
    if (s.location === "denied") return "denied";
    return "prompt";
  } catch { return "unknown"; }
}

// 정확도가 기준(desiredAccuracy) 이내가 될 때까지 최대 maxWaitMs 동안 재시도하며
// 가장 정확한 위치를 잡아서 반환한다. (한 번에 저장 실패 방지)
export async function getLocation(opts = {}) {
  const desiredAccuracy = opts.desiredAccuracy ?? 500; // m — 이 이내면 즉시 사용
  const maxWaitMs = opts.maxWaitMs ?? 12000;
  await ensurePermission();

  // 이미 상시 감지(watch)로 충분히 정확한 위치가 있으면 바로 사용
  let best = _lastPos ? { ..._lastPos } : null;
  if (best && best.acc <= desiredAccuracy) return best;

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
      const loc = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
      if (!best || loc.acc < best.acc) best = loc;
      if (loc.acc <= desiredAccuracy) return loc; // 기준 충족 → 즉시 반환
    } catch { /* 실패 시 잠시 후 재시도 */ }
    await new Promise((r) => setTimeout(r, 800));
  }
  return best; // 최선의 위치(없으면 null)
}

export const locText = (loc) => (loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : "위치 없음");
export const mapUrl = (loc) => (loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null);

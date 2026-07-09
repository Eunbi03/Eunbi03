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

export async function getDeviceId() {
  return (await sha256("att::device::" + deviceRaw())).slice(0, 32);
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

// 위치 권한이 없으면 요청한다.
async function ensurePermission() {
  try {
    const s = await Geolocation.checkPermissions();
    if (s.location !== "granted" && s.coarseLocation !== "granted") {
      await Geolocation.requestPermissions();
    }
  } catch { /* 웹 등에서 무시 */ }
}

// 출근 중 GPS 상시 감지 (랜덤 위치 확인용)
export async function startLocationWatch() {
  if (_watchId !== null) return;
  await ensurePermission();
  try {
    _watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      (p) => { if (p) _lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; }
    );
  } catch { /* 무시 */ }
}

export async function stopLocationWatch() {
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

export async function getLocation() {
  if (_lastPos) return { ..._lastPos };
  await ensurePermission();
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    return { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
  } catch { return null; }
}

export const locText = (loc) => (loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : "위치 없음");
export const mapUrl = (loc) => (loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null);

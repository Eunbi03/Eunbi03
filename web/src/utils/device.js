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

// 출근 중 GPS 상시 감지 (랜덤 위치 확인용)
let _watchId = null;
let _lastPos = null;

export function startLocationWatch() {
  if (!navigator.geolocation || _watchId !== null) return;
  _watchId = navigator.geolocation.watchPosition(
    (p) => { _lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; },
    () => {},
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

export function stopLocationWatch() {
  if (_watchId !== null) { navigator.geolocation.clearWatch(_watchId); _watchId = null; _lastPos = null; }
}

export async function checkLocationPermission() {
  if (!navigator.permissions) return 'unknown';
  try { const r = await navigator.permissions.query({ name: 'geolocation' }); return r.state; }
  catch { return 'unknown'; }
}

export function getLocation() {
  return new Promise((resolve) => {
    if (_lastPos) { resolve({ ..._lastPos }); return; }
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export const locText = (loc) => (loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : "위치 없음");
export const mapUrl = (loc) => (loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : null);

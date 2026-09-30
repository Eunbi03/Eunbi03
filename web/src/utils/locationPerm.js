// 위치 "항상 허용" 권한 확인/요청 + 앱 설정 열기 글루.
// 네이티브(iOS/안드로이드) 플러그인 LocationPerm을 호출한다.
// 웹에서는 해당 없음으로 처리(막지 않음). 플러그인 미탑재 등 오류 시에도 막지 않는다(기존 동작 유지).
import { registerPlugin, Capacitor } from "@capacitor/core";

const LocationPerm = registerPlugin("LocationPerm");

// 위치 권한이 "항상 허용"인지 확인하고, 아니면 한 번 요청까지 시도한 뒤 최종 여부를 반환한다.
// 반환: true = 항상 허용, false = 항상 허용 아님(설정 유도 필요)
export async function ensureAlwaysLocation() {
  if (Capacitor.getPlatform() === "web") return true;
  try {
    let r = await LocationPerm.checkAlways();
    if (r?.always) return true;
    // 앱 내 권한 요청 시도(iOS는 시스템 창 표시, 안드로이드 11+는 설정에서만 가능).
    // 콜백이 오지 않는 경우를 대비해 8초 타임아웃으로 감싼다.
    try {
      await Promise.race([
        LocationPerm.requestAlways(),
        new Promise((res) => setTimeout(res, 8000)),
      ]);
    } catch { /* 무시하고 재확인 */ }
    r = await LocationPerm.checkAlways();
    return !!r?.always;
  } catch {
    return true; // 플러그인 미탑재 등 — 출근을 막지 않는다(기존 동작 유지)
  }
}

// 앱 설정 페이지를 연다.
export async function openAppSettings() {
  try { await LocationPerm.openSettings(); } catch { /* 무시 */ }
}

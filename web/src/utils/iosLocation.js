// iOS 백그라운드 위치 수집 글루.
// iOS는 서버가 정한 시각에 앱을 깨울 수 없으므로, 출근 시 그날의 랜덤 슬롯과
// 각 슬롯 전용 서명 토큰을 받아 네이티브 플러그인(BgLocation)에 넘긴다.
// 네이티브는 근무 세션 동안 위치를 추적하며, 각 슬롯 시각(±5분) 창에서 위치를
// /api/random-check/native-submit 으로 직접 전송한다. (안드로이드는 FCM 경로라 무관)
import { registerPlugin, Capacitor } from "@capacitor/core";
import * as api from "../api/client.js";

const BgLocation = registerPlugin("BgLocation");
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export async function startIosBackgroundLocation() {
  if (Capacitor.getPlatform() !== "ios") return;
  try {
    const { slots } = await api.getRandomCheckTokens();
    await BgLocation.start({ apiBase: API_BASE, slots: slots || [] });
  } catch { /* 미구현/실패 시 무시 (포그라운드 수집은 계속 동작) */ }
}

export async function stopIosBackgroundLocation() {
  if (Capacitor.getPlatform() !== "ios") return;
  try { await BgLocation.stop(); } catch { /* 무시 */ }
}

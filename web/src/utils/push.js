import { registerPlugin } from "@capacitor/core";
import * as api from "../api/client.js";

// 네이티브(안드로이드) 커스텀 플러그인 — FCM 등록 토큰 조회
const Fcm = registerPlugin("Fcm");

// 로그인 후 호출: 이 기기의 FCM 토큰을 서버에 등록한다.
// (웹/그 외 환경에서는 플러그인이 없어 조용히 무시)
export async function registerPushToken() {
  try {
    const { token } = await Fcm.getToken();
    if (token) await api.registerFcmToken(token);
  } catch { /* 네이티브 아님 → 무시 */ }
}

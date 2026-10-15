import { registerPlugin, Capacitor } from "@capacitor/core";
import * as api from "../api/client.js";

// 네이티브(안드로이드/iOS) 커스텀 플러그인 — FCM 등록 토큰 조회
const Fcm = registerPlugin("Fcm");

// 로그인 후 호출: 이 기기의 FCM 토큰을 서버에 등록한다.
// (웹/그 외 환경에서는 플러그인이 없어 조용히 무시)
//
// ⚠️ 디버그 모드: iOS 토큰 미등록 원인 파악을 위해, 네이티브에서 결과/에러를 팝업으로 표시한다.
//    원인 확인 후 이 alert들은 제거할 예정.
export async function registerPushToken() {
  const isNative = Capacitor.getPlatform() !== "web";
  try {
    const { token } = await Fcm.getToken();
    if (token) {
      await api.registerFcmToken(token);
      if (isNative) alert("푸시 토큰 등록 성공: " + String(token).slice(0, 12) + "…");
    } else if (isNative) {
      alert("푸시 토큰 없음(빈 값)");
    }
  } catch (e) {
    if (isNative) alert("푸시 토큰 실패: " + (e?.message || JSON.stringify(e)));
  }
}

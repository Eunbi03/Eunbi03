import Foundation
import Capacitor
import FirebaseMessaging
import UserNotifications
import UIKit

// JS(push.js)의 registerPlugin("Fcm").getToken() 에 대응하는 iOS 플러그인.
// 알림 권한 요청 → 원격 알림(APNs) 등록 → (APNs 토큰이 준비된 뒤) FCM 토큰 반환.
//
// ⚠️ Capacitor 6부터는 CAPBridgedPlugin을 구현해야 JS에서 메서드가 인식된다.
@objc(FcmPlugin)
public class FcmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FcmPlugin"
    public let jsName = "Fcm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getToken", returnType: CAPPluginReturnPromise)
    ]

    @objc func getToken(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
                self.fetchToken(call, attempt: 0)
            }
        }
    }

    // FCM 토큰 조회. APNs 토큰이 아직이면 1.5초 간격으로 최대 10회(약 15초) 재시도.
    private func fetchToken(_ call: CAPPluginCall, attempt: Int) {
        Messaging.messaging().token { token, error in
            if let token = token, !token.isEmpty {
                call.resolve(["token": token])
            } else if attempt < 10 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    self.fetchToken(call, attempt: attempt + 1)
                }
            } else {
                call.reject(error?.localizedDescription ?? "FCM 토큰을 가져오지 못했습니다.")
            }
        }
    }
}

import Foundation
import Capacitor
import FirebaseMessaging
import UserNotifications
import UIKit

// JS(push.js)의 registerPlugin("Fcm").getToken() 에 대응하는 iOS 플러그인.
// 알림 권한 요청 → 원격 알림(APNs) 등록 → (APNs 토큰이 준비된 뒤) FCM 토큰 반환.
// 서버는 이 토큰으로 sendNotification()을 보내며, Firebase가 APNs로 전달한다.
//
// ⚠️ iOS는 APNs 토큰이 세팅되기 전에 FCM 토큰을 조회하면 실패한다.
//    권한 요청/APNs 등록은 비동기이므로, 토큰이 나올 때까지 잠깐 재시도한다.
@objc(FcmPlugin)
public class FcmPlugin: CAPPlugin {

    @objc func getToken(_ call: CAPPluginCall) {
        // 1) 알림 권한 요청 → 완료 후 2) APNs 원격 알림 등록 → 3) FCM 토큰 재시도 조회
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
                // APNs 토큰이 AppDelegate에서 Messaging에 연결될 시간을 주며 재시도
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

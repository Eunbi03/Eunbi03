import Foundation
import Capacitor
import FirebaseMessaging
import UserNotifications
import UIKit

// JS(push.js)의 registerPlugin("Fcm").getToken() 에 대응하는 iOS 플러그인.
// 알림 권한 요청 → 원격 알림(APNs) 등록 → FCM 토큰 반환.
// 서버는 이 토큰으로 sendNotification()을 보내며, Firebase가 APNs로 전달한다.
@objc(FcmPlugin)
public class FcmPlugin: CAPPlugin {

    @objc func getToken(_ call: CAPPluginCall) {
        // 1) 알림 권한 요청
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
            // 2) APNs 원격 알림 등록 (반드시 메인 스레드)
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
        // 3) FCM 토큰 조회 (APNs 매핑은 AppDelegate에서 설정됨)
        Messaging.messaging().token { token, error in
            if let token = token {
                call.resolve(["token": token])
            } else {
                call.reject(error?.localizedDescription ?? "FCM 토큰을 가져오지 못했습니다.")
            }
        }
    }
}

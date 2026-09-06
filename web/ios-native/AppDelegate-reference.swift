// iOS FCM/APNs 연동을 위한 AppDelegate 참고본.
// 맥의 ios/App/App/AppDelegate.swift 에 아래 표시(★)된 부분을 추가하세요.
// (기존 Capacitor 기본 AppDelegate에 Firebase 초기화 + APNs 토큰 연동을 더한 형태)

import UIKit
import Capacitor
import FirebaseCore        // ★ 추가
import FirebaseMessaging   // ★ 추가
import UserNotifications   // ★ 추가

@main
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {  // ★ 프로토콜 3개 추가

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()                                   // ★ Firebase 초기화
        Messaging.messaging().delegate = self                    // ★
        UNUserNotificationCenter.current().delegate = self       // ★
        return true
    }

    // ★ APNs 디바이스 토큰을 Firebase에 연결 (이게 있어야 FCM→APNs 전달됨)
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs 등록 실패: \(error.localizedDescription)")
    }

    // ★ 앱이 켜져 있을 때(포그라운드)도 알림을 배너로 표시
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    // ── 아래는 Capacitor 기본 AppDelegate에 원래 있던 메서드들 (그대로 유지) ──
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

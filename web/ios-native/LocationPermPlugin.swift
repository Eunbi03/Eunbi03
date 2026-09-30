import Foundation
import Capacitor
import CoreLocation
import UIKit

// 위치 권한이 "항상 허용(authorizedAlways)"인지 확인/요청하고, 앱 설정 페이지를 여는 플러그인.
// 출근 버튼을 누를 때 "항상 허용"이 아니면 출근을 막고 설정으로 유도하는 용도.
@objc(LocationPermPlugin)
public class LocationPermPlugin: CAPPlugin, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    private var pendingRequestCall: CAPPluginCall?

    override public func load() {
        manager.delegate = self
    }

    private func currentStatus() -> CLAuthorizationStatus {
        if #available(iOS 14.0, *) { return manager.authorizationStatus }
        return CLLocationManager.authorizationStatus()
    }

    private func statusString(_ s: CLAuthorizationStatus) -> String {
        switch s {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    // 현재 권한이 "항상 허용"인지 반환한다. (즉시 반환 — GPS 측정 없음)
    @objc func checkAlways(_ call: CAPPluginCall) {
        let s = currentStatus()
        call.resolve(["always": s == .authorizedAlways, "status": statusString(s)])
    }

    // "항상 허용" 권한을 요청한다. 시스템 권한 창을 띄우고, 결정되면 결과를 반환한다.
    // 이미 "항상 허용"이면 즉시 반환. (iOS는 보통 '앱 사용 중' 이후 '항상'으로만 올릴 수 있음)
    @objc func requestAlways(_ call: CAPPluginCall) {
        let s = currentStatus()
        if s == .authorizedAlways {
            call.resolve(["always": true, "status": "always"]); return
        }
        // 결정 대기 콜백에 응답하기 위해 보관. (delegate가 호출되면 resolve)
        pendingRequestCall = call
        DispatchQueue.main.async { self.manager.requestAlwaysAuthorization() }
    }

    // 앱 설정 페이지를 연다.
    @objc func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.resolve(["opened": false]); return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { ok in call.resolve(["opened": ok]) }
        }
    }

    // 권한 상태가 바뀌면(사용자가 창에서 선택하면) 대기 중인 requestAlways 호출에 응답한다.
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = pendingRequestCall else { return }
        let s = currentStatus()
        // notDetermined는 아직 미결정 — 최종 결정이 날 때까지 기다린다.
        if s == .notDetermined { return }
        pendingRequestCall = nil
        call.resolve(["always": s == .authorizedAlways, "status": statusString(s)])
    }
}

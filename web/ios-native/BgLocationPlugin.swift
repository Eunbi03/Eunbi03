import Foundation
import Capacitor
import CoreLocation

// TimeCard iOS 백그라운드 위치 플러그인.
// 근무 세션 동안 위치 매니저를 켜 앱을 살려두고, 서버가 준 랜덤 슬롯 시각(±5분) 창에서
// 위치를 /api/random-check/native-submit 으로 직접 전송한다.
//
// 설계 근거: iOS는 서버가 정한 시각에 백그라운드 앱을 깨울 수 없으므로,
// 위치 업데이트 콜백(앱을 살려두는 수단)에서 제출 시각 창을 확인해 전송한다.
@objc(BgLocationPlugin)
public class BgLocationPlugin: CAPPlugin, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    private var apiBase: String = ""
    private struct Slot { let checkId: String; let token: String; let start: Date; var submitted: Bool }
    private var slots: [Slot] = []
    private var running = false

    override public func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        if #available(iOS 11.0, *) { manager.showsBackgroundLocationIndicator = true }
    }

    // start({ apiBase, slots: [{ checkId, t, scheduledTime(ISO) }] })
    @objc func start(_ call: CAPPluginCall) {
        apiBase = call.getString("apiBase") ?? ""
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNoFrac = ISO8601DateFormatter()
        isoNoFrac.formatOptions = [.withInternetDateTime]

        var parsed: [Slot] = []
        if let arr = call.getArray("slots") as? [[String: Any]] {
            for s in arr {
                guard let checkId = s["checkId"] as? String,
                      let token = s["t"] as? String,
                      let ts = s["scheduledTime"] as? String else { continue }
                let date = iso.date(from: ts) ?? isoNoFrac.date(from: ts)
                if let d = date { parsed.append(Slot(checkId: checkId, token: token, start: d, submitted: false)) }
            }
        }
        slots = parsed

        manager.requestAlwaysAuthorization()
        manager.startUpdatingLocation()
        running = true
        call.resolve(["started": true, "slots": slots.count])
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stopUpdatingLocation()
        running = false
        slots = []
        call.resolve()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running, let loc = locations.last else { return }
        let now = Date()
        for i in slots.indices {
            if slots[i].submitted { continue }
            let winStart = slots[i].start
            let winEnd = slots[i].start.addingTimeInterval(5 * 60) // 시각 +5분 창
            if now >= winStart && now <= winEnd {
                slots[i].submitted = true
                submit(slot: slots[i], loc: loc)
            }
        }
        // 남은 미제출 슬롯 중 아직 창이 안 지난 게 없으면 추적 중지(배터리 절약)
        if !slots.contains(where: { !$0.submitted && now <= $0.start.addingTimeInterval(5 * 60) }) {
            manager.stopUpdatingLocation()
            running = false
        }
    }

    private func submit(slot: Slot, loc: CLLocation) {
        guard let url = URL(string: apiBase + "/random-check/native-submit") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "t": slot.token,
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracyM": loc.horizontalAccuracy,
            "isMocked": false
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }
}

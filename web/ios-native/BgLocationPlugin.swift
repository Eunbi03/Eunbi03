import Foundation
import Capacitor
import CoreLocation

// TimeCard iOS 백그라운드 위치 플러그인.
// 근무 세션 동안 위치 매니저를 켜 앱을 살려두고, 서버가 준 랜덤 슬롯 시각(±5분) 창에서
// 위치를 /api/random-check/native-submit 으로 전송한다.
//
// 설계 근거: iOS는 서버가 정한 시각에 백그라운드 앱을 깨울 수 없으므로,
// 위치 업데이트로 앱을 살려두고, (콜백 + 주기 타이머)로 제출 시각 창을 확인해 전송한다.
@objc(BgLocationPlugin)
public class BgLocationPlugin: CAPPlugin, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    private var apiBase: String = ""
    private final class Slot { let checkId: String; let token: String; let start: Date; var submitted = false; var inFlight = false
        init(checkId: String, token: String, start: Date) { self.checkId = checkId; self.token = token; self.start = start } }
    private var slots: [Slot] = []
    private var running = false
    private var timer: Timer?

    override public func load() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        // 정지 상태에서도 업데이트가 오도록 거리 필터를 두지 않는다(창 평가 누락 방지).
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        if #available(iOS 11.0, *) { manager.showsBackgroundLocationIndicator = true }
    }

    // start({ apiBase, slots: [{ checkId, t, scheduledTime(ISO) }] })
    @objc func start(_ call: CAPPluginCall) {
        // 이미 실행 중이면 중복 시작 무시(중복 제출 방지). 슬롯은 세션 내 불변.
        if running { call.resolve(["started": true, "slots": slots.count, "already": true]); return }

        apiBase = call.getString("apiBase") ?? ""
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNoFrac = ISO8601DateFormatter(); isoNoFrac.formatOptions = [.withInternetDateTime]

        var parsed: [Slot] = []
        if let arr = call.getArray("slots") as? [[String: Any]] {
            for s in arr {
                guard let checkId = s["checkId"] as? String,
                      let token = s["t"] as? String,
                      let ts = s["scheduledTime"] as? String else { continue }
                if let d = iso.date(from: ts) ?? isoNoFrac.date(from: ts) {
                    parsed.append(Slot(checkId: checkId, token: token, start: d))
                }
            }
        }
        slots = parsed
        running = true

        manager.requestAlwaysAuthorization()
        manager.startUpdatingLocation()
        // 위치 콜백이 뜸할 때를 대비해 주기적으로도 창을 평가한다(앱이 살아있는 동안 동작).
        DispatchQueue.main.async {
            self.timer?.invalidate()
            self.timer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in self?.evaluate() }
        }
        call.resolve(["started": true, "slots": slots.count])
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stopUpdatingLocation()
        timer?.invalidate(); timer = nil
        running = false
        slots = []
        call.resolve()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        evaluate()
    }

    // 현재 위치로 열린 슬롯 창을 제출하고, 남은 창이 없으면 추적을 멈춘다.
    private func evaluate() {
        guard running, let loc = manager.location else { return }
        let now = Date()
        for slot in slots {
            if slot.submitted || slot.inFlight { continue }
            let winStart = slot.start
            let winEnd = slot.start.addingTimeInterval(5 * 60) // 시각 +5분 창
            if now >= winStart && now <= winEnd {
                slot.inFlight = true
                submit(slot: slot, loc: loc)
            }
        }
        // 아직 창이 안 지난(제출 대기) 슬롯이 하나도 없으면 배터리 절약을 위해 중지
        if !slots.contains(where: { !$0.submitted && now <= $0.start.addingTimeInterval(5 * 60) }) {
            manager.stopUpdatingLocation()
            timer?.invalidate(); timer = nil
            running = false
        }
    }

    private func submit(slot: Slot, loc: CLLocation) {
        guard let url = URL(string: apiBase + "/random-check/native-submit") else { slot.inFlight = false; return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "t": slot.token,
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracyM": max(0, loc.horizontalAccuracy),
            "isMocked": false
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            // 성공(2xx) 또는 이미 제출/마감(409)이면 완료로 확정, 그 외(네트워크 등)는 재시도 위해 되돌림
            if (200...299).contains(code) || code == 409 { slot.submitted = true }
            slot.inFlight = false
        }.resume()
    }
}

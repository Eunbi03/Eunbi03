import UIKit
import Capacitor

// Capacitor 6에서 앱 내장(로컬) 커스텀 플러그인이 자동 등록되지 않는 문제를 해결하기 위해,
// 브리지 로드 시 플러그인 인스턴스를 명시적으로 등록한다.
// ⚠️ Main.storyboard의 Bridge View Controller 커스텀 클래스를 이 MainViewController로 지정해야 적용된다.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FcmPlugin())
        bridge?.registerPluginInstance(BgLocationPlugin())
        bridge?.registerPluginInstance(LocationPermPlugin())
    }
}

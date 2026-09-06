# iOS 백그라운드 위치 — 맥에서 통합하는 방법

이 폴더의 Swift/ObjC 파일은 **iOS 백그라운드 위치 수집 플러그인**(`BgLocation`)입니다.
`ios/` 프로젝트는 맥에서 생성되므로, 아래 순서로 맥(Xcode)에서 붙여야 실제로 동작합니다.

> 서버 엔드포인트(`/api/random-check/today-tokens`, `/native-submit`)와 공통 JS 글루
> (`web/src/utils/iosLocation.js`)는 이미 구현되어 있습니다. 아래는 **iOS 앱 쪽 연결**만 다룹니다.

## 사전 준비 (맥)
- **Xcode 정식판**(App Store) 설치, 최초 실행해 라이선스 동의.
- **CocoaPods** 설치: `sudo gem install cocoapods` (또는 `brew install cocoapods`).
- Apple 계정(개발자 프로그램) — 실기기 테스트/배포 시 필요.

## 1. iOS 프로젝트 생성
```bash
cd <맥의 Eunbi03 경로>/web
git pull origin claude/funny-thompson-c07jdx
npm install
npm run build:mobile
npx cap add ios          # ios/ 폴더 최초 생성
npx cap sync ios
```

## 2. 플러그인 파일 추가
- Xcode로 `web/ios/App/App.xcworkspace` 열기.
- 이 폴더의 **`BgLocationPlugin.swift`, `BgLocationPlugin.m`** 두 파일을
  Xcode 프로젝트의 `App/App` 그룹에 드래그해 추가(“Copy items if needed” 체크).
- `.m` 추가 시 Objective‑C 브리징 헤더 생성 여부를 물으면 **생성(Create)** 선택.

## 3. Info.plist 권한/배경 모드
`web/ios/App/App/Info.plist` 에 추가:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>출퇴근 기록과 근무 중 위치 확인을 위해 위치를 사용합니다.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>근무 시간 동안 하루 최대 5회 무작위로 위치를 확인해 실제 근무 여부를 점검합니다. 이를 위해 '항상 허용'이 필요하며, 근무 시간 외에는 위치를 수집하지 않습니다.</string>
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
```
또는 Xcode → 타깃 App → Signing & Capabilities → **Background Modes** → **Location updates** 체크.

## 4. 빌드/실행
```bash
cd web/ios/App && pod install
```
- Xcode에서 실기기 선택 → 서명 팀 지정 → Run.
- 앱에서 위치 권한을 **"항상 허용"** 으로 승인해야 백그라운드 수집이 됩니다.

## 동작 개요
- 출근 시 JS가 `today-tokens`로 그날 슬롯+토큰을 받아 `BgLocation.start()` 호출.
- 네이티브가 위치 매니저를 켜 앱을 유지하고, 각 슬롯 시각 **±5분** 창에서 위치를 `native-submit`으로 전송.
- 퇴근 또는 모든 슬롯 제출 완료 시 추적 중지(배터리 절약).

## 한계
- 사용자가 "항상 허용"을 "앱 사용 중에만"으로 낮추거나, 정지 상태가 길어 위치 콜백이 창 안에 안 오면 놓칠 수 있음.
- 앱 강제 종료 시 중단. (포그라운드에서는 제약 없이 수집)
- 이 코드는 이 환경에서 컴파일 검증되지 않았습니다. 맥에서 빌드 중 오류가 나면 알려주세요.

---

# iOS 푸시 알림(APNs/FCM) — 출근/퇴근/노트 리마인더

서버는 이미 FCM 토큰으로 `sendNotification`을 보냅니다. iOS가 **FCM 토큰을 등록**하고
**APNs로 알림을 받도록** 아래를 설정하면, 안드로이드와 동일하게 서버 푸시 알림이 옵니다.
**Apple 개발자 계정(유료)** 이 필요합니다.

## 1. Firebase 콘솔 (iOS 앱 등록 + APNs 키)
1. Firebase 콘솔 → 프로젝트 → **iOS 앱 추가**, Bundle ID = `com.kpride.timecard`(Xcode와 동일하게)
2. **`GoogleService-Info.plist`** 다운로드
3. Apple 개발자 사이트 → **APNs 인증 키(.p8)** 발급 (Key ID·Team ID 메모)
4. Firebase → 프로젝트 설정 → **Cloud Messaging → Apple 앱 구성 → APNs 인증 키 업로드**(.p8 + Key ID + Team ID)

## 2. Xcode
1. 다운로드한 **`GoogleService-Info.plist`** 를 App/App 그룹에 드래그(Target App 체크)
2. **Signing & Capabilities → + Capability**:
   - **Push Notifications** 추가
   - **Background Modes** → **Remote notifications** 체크(기존 Location updates와 함께)
3. `web/ios-native/`의 **`FcmPlugin.swift`, `FcmPlugin.m`** 을 App/App 그룹에 추가(.m 추가 시 브리징 헤더 유지)
4. **AppDelegate.swift** 를 `web/ios-native/AppDelegate-reference.swift` 의 ★ 표시대로 수정
   (Firebase 초기화 + APNs 토큰 연결 + 포그라운드 배너 표시)

## 3. Podfile (ios/App/Podfile)
App 타깃에 Firebase Messaging 추가:
```ruby
target 'App' do
  capacitor_pods
  # ↓ 추가
  pod 'FirebaseMessaging'
end
```
그다음:
```bash
cd web/ios/App && pod install
```

## 4. 빌드·확인
- 실기기에서 Run → 앱 로그인 시 알림 권한 허용 → `push.js`가 FCM 토큰을 서버에 등록
- 서버가 출근-5분/퇴근-5분/노트 시각에 알림 발송 → iOS에 표시

## 5. ⚠️ 로컬 알림 중복 끄기 (APNs 확인 후)
현재 `web/src/components/Employee.jsx`는 **안드로이드만** 로컬 알림을 끕니다.
iOS 서버 푸시가 정상 동작하는 걸 확인한 뒤, 그 가드를 아래처럼 바꿔 **iOS도 로컬 알림을 끄세요**
(안 그러면 로컬+서버 알림이 중복됩니다):
```js
// 변경 전: if (Capacitor.getPlatform() === "android") return;
// 변경 후(iOS도 서버 푸시 사용 시):
if (Capacitor.getPlatform() !== "web") return;
```
> APNs 설정 전에는 이 줄을 바꾸지 마세요. 바꾸면 APNs가 준비되기 전 iOS에 리마인더가 아예 안 옵니다.

## 참고
- 시뮬레이터는 원격 푸시 수신이 제한적입니다. **실기기**에서 확인하세요.
- 위 Swift/설정은 이 환경에서 컴파일 검증되지 않았습니다. 빌드 오류 시 로그를 알려주세요.

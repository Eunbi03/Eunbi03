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

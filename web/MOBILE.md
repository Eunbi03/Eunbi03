# TimeCard 네이티브 앱(Android) 빌드 안내

Capacitor로 기존 웹앱을 감싸 안드로이드 앱(APK)으로 빌드한다.
모든 명령은 **맥 터미널에서 `web/` 폴더 안**에서 실행한다.

## 최초 1회 세팅

```bash
cd ~/Desktop/Eunbi03/web

# 1) 의존성 설치
npm install

# 2) 모바일용 웹 빌드 (API 주소가 전체 URL로 주입됨)
npm run build:mobile

# 3) 안드로이드 네이티브 프로젝트 생성 (android/ 폴더 생성)
npx cap add android

# 4) 웹 빌드 결과를 앱에 동기화
npx cap sync

# 5) Android Studio 열기
npx cap open android
```

Android Studio가 열리면 상단 메뉴 **Build → Build Bundle(s) / APK(s) → Build APK(s)** 로 APK를 만든다.
완성된 APK를 폰에 옮겨 설치하면 된다. (설정 → "출처를 알 수 없는 앱 설치" 허용 필요)

## 코드 수정 후 다시 빌드할 때

```bash
cd ~/Desktop/Eunbi03/web
git pull
npm run cap:sync   # = build:mobile + cap sync
npx cap open android
```

## 참고
- `android/` 폴더는 생성 후 **git에 커밋해서 푸시**해 둔다. (권한/설정 파일을 함께 관리하기 위함)
- API 주소는 `web/.env.mobile` 에서 관리한다.
- 백그라운드 위치·알림 기능은 이후 단계에서 플러그인으로 추가한다.

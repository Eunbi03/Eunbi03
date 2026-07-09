import admin from 'firebase-admin';
import fs from 'fs';

let _enabled = false;
let _tried = false;

// firebase-admin 지연 초기화 (키 파일이 있으면 활성화, 없으면 조용히 비활성)
function init(): void {
  if (_tried) return;
  _tried = true;
  try {
    const p = process.env.FIREBASE_KEY_PATH || '/app/firebase-key.json';
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      console.warn('[FCM] 서비스 계정 키 파일 없음 — 푸시 비활성화');
      return;
    }
    const sa = JSON.parse(fs.readFileSync(p, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    _enabled = true;
    console.log('[FCM] 초기화 완료');
  } catch (e: any) {
    console.error('[FCM] 초기화 실패:', e.message);
  }
}

export function fcmEnabled(): boolean {
  init();
  return _enabled;
}

// 데이터 전용(무음) 푸시 — 앱이 백그라운드/종료 상태여도 네이티브가 깨어나 처리한다.
export async function sendDataPush(token: string, data: Record<string, string>): Promise<boolean> {
  init();
  if (!_enabled || !token) return false;
  try {
    await admin.messaging().send({
      token,
      data,
      android: { priority: 'high' },
    });
    return true;
  } catch (e: any) {
    console.error('[FCM] 전송 실패:', e.message);
    return false;
  }
}

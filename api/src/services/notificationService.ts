import { pool } from '../db/pool';

let adminApp: any = null;

function ensureInitialized() {
  if (adminApp) return;
  const fcmPath = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (!fcmPath) { console.warn('[알림] FCM_SERVICE_ACCOUNT_PATH 미설정 — 푸시 알림 비활성화'); return; }
  try {
    const admin = require('firebase-admin');
    adminApp = admin.initializeApp({ credential: admin.credential.cert(require(fcmPath)) });
  } catch (err: any) {
    console.error('[알림] Firebase Admin 초기화 실패:', err.message);
  }
}

export async function notifyHRTeam(userId: string, userName: string, message: string): Promise<void> {
  ensureInitialized();
  if (!adminApp) { console.warn(`[알림 생략] HR: ${userName} - ${message}`); return; }
  try {
    const admin = require('firebase-admin');
    await admin.messaging().send({
      topic: process.env.HR_ALERT_FCM_TOPIC || 'hr_alerts',
      notification: { title: '보안 알림: 계정 잠금', body: `${userName} 계정: ${message}` },
      data: { userId, type: 'account_locked' },
    });
  } catch (err: any) { console.error('[알림] HR 알림 실패:', err.message); }
}

export async function notifyUser(userId: string, payload: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
  ensureInitialized();
  if (!adminApp) { console.warn(`[알림 생략] 사용자(${userId}): ${payload.title}`); return; }
  const { rows } = await pool.query('SELECT fcm_token FROM users WHERE id = $1', [userId]);
  const fcmToken = rows[0]?.fcm_token;
  if (!fcmToken) return;
  try {
    const admin = require('firebase-admin');
    await admin.messaging().send({ token: fcmToken, notification: { title: payload.title, body: payload.body }, data: payload.data || {} });
  } catch (err: any) { console.error(`[알림] 사용자(${userId}) 실패:`, err.message); }
}

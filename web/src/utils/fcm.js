import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let messaging = null;

function getMessagingInstance() {
  if (!messaging) {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  }
  return messaging;
}

export async function requestFcmToken() {
  if (!("Notification" in window)) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  try {
    const msg = getMessagingInstance();
    const token = await getToken(msg, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js"),
    });
    return token || null;
  } catch (err) {
    console.warn("[FCM] 토큰 요청 실패:", err.message);
    return null;
  }
}

export function onForegroundMessage(callback) {
  try {
    const msg = getMessagingInstance();
    return onMessage(msg, callback);
  } catch {
    return () => {};
  }
}

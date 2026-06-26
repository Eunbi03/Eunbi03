importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyplaceholder",
  authDomain: "timecard-58295.firebaseapp.com",
  projectId: "timecard-58295",
  messagingSenderId: "SENDER_ID_PLACEHOLDER",
  appId: "APP_ID_PLACEHOLDER",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "알림", {
    body: body || "",
    icon: "/icon-192.png",
    data: payload.data,
  });
});

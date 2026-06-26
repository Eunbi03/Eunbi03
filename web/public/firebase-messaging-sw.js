importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCWe0LlKW4MYKz886ylEyO_ik991UFpGIQ",
  authDomain: "timecard-58295.firebaseapp.com",
  projectId: "timecard-58295",
  storageBucket: "timecard-58295.firebasestorage.app",
  messagingSenderId: "428340738558",
  appId: "1:428340738558:web:10728f011af57cd7a268af",
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

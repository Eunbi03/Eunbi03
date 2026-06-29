-- 푸시 알림(FCM) 기능을 제거했으므로 더 이상 사용하지 않는 컬럼을 삭제한다.
ALTER TABLE users DROP COLUMN IF EXISTS fcm_token;

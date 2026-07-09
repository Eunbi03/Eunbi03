-- 근로자 기기의 FCM 푸시 토큰 저장 (백그라운드 랜덤 위치확인 알림용)
ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- 서버 푸시 리마인더(출근/퇴근/노트) 중복 발송 방지
CREATE TABLE IF NOT EXISTS daily_reminders_sent (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    DATE NOT NULL,
  type    TEXT NOT NULL,           -- 'checkIn' | 'checkOut' | 'note'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date, type)
);

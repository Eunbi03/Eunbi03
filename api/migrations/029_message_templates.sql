-- 발송 메시지(문자/이메일/푸시) 제목·내용을 설정에서 관리하기 위한 템플릿 테이블.
-- {placeholder} 형태의 치환자를 본문에 넣으면 발송 시 실제 값으로 치환된다.
CREATE TABLE IF NOT EXISTS message_templates (
  key          TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  subject      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  placeholders TEXT NOT NULL DEFAULT '',   -- UI 안내용 치환자 설명
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO message_templates (key, label, subject, body, placeholders) VALUES
(
  'monthly_report', '월간 근태 리포트',
  '[{month}월 근태관리 리포트 안내]',
  E'안녕하세요, {name}님.\n{corp} 인사팀입니다.\n\n{month}월 근태관리 리포트를 보내드립니다.\n{reprimand}근태 현황에 대한 자세한 내용은 TimeCard 개인 애플리케이션에서 확인하실 수 있습니다.\n문의사항이 있으시면 아래 연락처로 문의해 주시기 바랍니다.\n리포트: {link}\n\n감사합니다.\n{managers}',
  '{name} 직원명, {corp} 법인명, {month} 월, {link} 리포트 링크, {deadline} 시말서 마감일, {reprimand} 시말서 안내문(자동), {managers} 담당자 서명(자동)'
),
(
  'device_invite', '관리자 기기 등록 초대',
  'TimeCard 관리자 기기 등록 안내',
  E'{name}님, 아래 링크를 등록하려는 기기(휴대폰/PC)에서 열면 해당 기기가 관리자 기기로 등록됩니다.\n\n{link}\n\n링크는 7일간 유효합니다.',
  '{name} 관리자명, {link} 등록 링크'
),
(
  'random_check_push', '위치 확인 푸시 알림',
  'TimeCard',
  '위치 권한을 확인해 주세요.',
  '(치환자 없음 — 제목=알림 제목, 내용=알림 본문)'
)
ON CONFLICT (key) DO NOTHING;

-- 자율 메시지: 앱 설치 링크·설명서 안내 등 상황별로 보내는 자유 양식 메시지.
-- 내용은 관리자가 설정 → 발송 메시지 관리에서 직접 작성한다.
INSERT INTO message_templates (key, label, subject, body, placeholders) VALUES
(
  'free_message', '자율 메시지',
  'TimeCard 안내',
  '',
  '{name} 이름, {phone} 전화번호, {email} 이메일, {corp} 법인, {division} 본부, {team} 팀, {position} 직책, {jobTitle} 직무, {workplace} 근무지, {manual} 설명서 링크'
)
ON CONFLICT (key) DO NOTHING;

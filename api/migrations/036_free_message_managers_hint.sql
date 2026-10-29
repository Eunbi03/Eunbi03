-- 자율 메시지 치환자 안내에 {managers}(문의처) 추가.
UPDATE message_templates
   SET placeholders = '{name} 이름, {phone} 전화번호, {email} 이메일, {corp} 법인, {division} 본부, {team} 팀, {position} 직책, {jobTitle} 직무, {workplace} 근무지, {manual} 설명서 링크, {managers} 문의처(담당자)'
 WHERE key = 'free_message';

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { renderTemplate } from './messageTemplates';

// 템플릿 본문(일반 텍스트)을 이메일 HTML로 변환: 이스케이프 + 링크 자동연결 + 줄바꿈.
function htmlizeBody(text: string, link?: string): string {
  const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
  let h = esc(text);
  if (link) h = h.split(esc(link)).join(`<a href="${link}">${esc(link)}</a>`);
  h = h.replace(/\n/g, '<br>');
  return `<div style="font-family:'맑은 고딕',sans-serif;color:#333;font-size:14px;line-height:1.7;">${h}</div>`;
}

// 솔라피(SOLAPI) 단문/장문 발송. 성공 시 true.
async function sendSolapiSms(to: string, text: string, fromOverride?: string): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  // 법인별 발신번호(담당자 전화) 우선, 없으면 공통 SMS_SENDER
  const from = ((fromOverride || process.env.SMS_SENDER || '')).replace(/\D/g, '');
  if (!apiKey || !apiSecret || !from) return false;

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  const authorization = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

  // 90바이트 초과면 장문(LMS)
  const type = Buffer.byteLength(text, 'utf8') > 90 ? 'LMS' : 'SMS';
  const message: any = { to: to.replace(/\D/g, ''), from, text, type };
  if (type === 'LMS') message.subject = '근태관리 리포트';

  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SOLAPI ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

// 관리자 기기 등록 링크를 이메일과 문자(SOLAPI)로 함께 발송한다.
// 반환: 실제로 발송된 채널 목록.
export async function sendAdminDeviceInvite(opts: {
  name: string; email?: string | null; phone?: string | null; link: string; senderPhone?: string;
}): Promise<{ email: boolean; sms: boolean }> {
  const { name, email, phone, link, senderPhone = '' } = opts;
  const { subject, body: bodyText } = await renderTemplate('device_invite', { name: name || '관리자', link });
  const bodyHtml = htmlizeBody(bodyText, link);

  const result = { email: false, sms: false };
  if (email && process.env.SMTP_HOST && process.env.SMTP_USER) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port,
      secure: port === 465, // 465=암시적 SSL, 587=STARTTLS (리포트 발송과 동일)
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    try { await transporter.sendMail({ from: process.env.SMTP_USER, to: email, subject, html: bodyHtml, text: bodyText }); result.email = true; }
    catch (e: any) { console.error('[기기등록 이메일 실패]', e.message); }
  }
  if (phone && process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET) {
    try { result.sms = await sendSolapiSms(phone, bodyText, senderPhone || process.env.SMS_SENDER || ''); }
    catch (e: any) { console.error('[기기등록 문자 실패]', e.message); }
  }
  return result;
}

// 자율 메시지: 설정의 'free_message' 템플릿을 치환해 발송.
// channel: 'email'=이메일만, 'sms'=문자만, 'both'=이메일 있으면 이메일, 없으면 문자.
export async function sendFreeMessage(opts: {
  email?: string | null; phone?: string | null; channel: 'email' | 'sms' | 'both';
  vars?: Record<string, string>; senderPhone?: string;
}): Promise<'email' | 'sms' | 'none'> {
  const { email, phone, channel, vars = {}, senderPhone = '' } = opts;
  const { subject, body: bodyText } = await renderTemplate('free_message', vars);
  const bodyHtml = htmlizeBody(bodyText);

  const wantEmail = channel === 'email' ? !!email : (channel === 'both' ? !!email : false);
  const wantSms = channel === 'sms' ? !!phone : (channel === 'both' ? (!email && !!phone) : false);

  if (wantEmail && process.env.SMTP_HOST && process.env.SMTP_USER) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    try { await transporter.sendMail({ from: process.env.SMTP_USER, to: email as string, subject: subject || 'TimeCard', html: bodyHtml, text: bodyText }); return 'email'; }
    catch (e: any) { console.error('[자율메시지 이메일 실패]', e.message); return 'none'; }
  }
  if (wantSms && process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET) {
    try { const ok = await sendSolapiSms(phone as string, bodyText, senderPhone || process.env.SMS_SENDER || ''); return ok ? 'sms' : 'none'; }
    catch (e: any) { console.error('[자율메시지 문자 실패]', e.message); return 'none'; }
  }
  return 'none';
}

interface ReportData {
  to: string; name: string; yearMonth: string;
  lateCount: number; earlyLeaveCount: number; missingClockCount: number;
  missingReportCount: number; totalViolations: number; reprimandRequired: boolean;
}

// 월간 리포트 링크를 이메일(우선) 또는 문자로 발송한다. 반환: 사용된 채널.
export async function sendReportLink(opts: {
  name: string; email?: string | null; phone?: string | null; monthLabel: string; link: string;
  corpName?: string; over?: boolean; deadlineText?: string; managers?: { name: string; phone: string }[]; senderPhone?: string;
}): Promise<'email' | 'sms' | 'none'> {
  const { name, email, phone, monthLabel, link, corpName = '', over = false, deadlineText = '', managers = [], senderPhone = '' } = opts;

  // 설정의 템플릿을 치환해 제목/본문 생성 ({reprimand}, {managers}는 서버가 계산)
  const reprimand = over
    ? `이번 근태 내역과 관련하여 ${deadlineText}까지 시말서를 제출하여 주시기 바랍니다. 향후 원활한 근태관리를 위해 관련 규정을 준수하여 주시기 바랍니다.\n`
    : '';
  const managersText = managers.map((m) => `${m.name} 담당자 (☎ ${m.phone})`).join('\n');
  const { subject, body: bodyText } = await renderTemplate('monthly_report', {
    name, corp: corpName, month: monthLabel, link, deadline: deadlineText, reprimand, managers: managersText,
  });
  const bodyHtml = htmlizeBody(bodyText, link);

  if (email && process.env.SMTP_HOST && process.env.SMTP_USER) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465=암시적 SSL, 587=STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({ from: process.env.SMTP_USER, to: email, subject, html: bodyHtml, text: bodyText });
    return 'email';
  }

  // 이메일이 없으면 문자(SOLAPI LMS) — 법인 담당자 번호를 발신번호로
  const smsFrom = senderPhone || process.env.SMS_SENDER || '';
  if (phone && process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && smsFrom) {
    await sendSolapiSms(phone, bodyText, smsFrom);
    return 'sms';
  }

  console.warn(`[리포트 발송 채널 없음] ${name} — 이메일/문자 설정 없음`);
  return 'none';
}

export async function sendReportEmail(data: ReportData): Promise<void> {
  const { to, name, yearMonth, lateCount, earlyLeaveCount, missingClockCount, missingReportCount, totalViolations, reprimandRequired } = data;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn(`[리포트 이메일 생략] SMTP 미설정 — ${name}(${to})`);
    return;
  }

  const _port = parseInt(process.env.SMTP_PORT || '587', 10);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: _port,
    secure: _port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  const reprimandNote = reprimandRequired
    ? `\n⚠️ 이번 달 총 위반 ${totalViolations}회로 시말서 제출 대상입니다.`
    : '';

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: `[근태] ${yearMonth} 월간 리포트 — ${name}`,
    text: [
      `${name}님, ${yearMonth} 월간 근태 리포트입니다.`,
      ``,
      `· 지각: ${lateCount}회`,
      `· 조퇴: ${earlyLeaveCount}회`,
      `· 출퇴근 누락: ${missingClockCount}회`,
      `· 업무일지 미작성: ${missingReportCount}회`,
      reprimandNote,
    ].join('\n'),
  });
}

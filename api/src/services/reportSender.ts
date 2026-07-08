import nodemailer from 'nodemailer';
import crypto from 'crypto';

// 솔라피(SOLAPI) 단문/장문 발송. 성공 시 true.
async function sendSolapiSms(to: string, text: string): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const from = (process.env.SMS_SENDER || '').replace(/\D/g, '');
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

interface ReportData {
  to: string; name: string; yearMonth: string;
  lateCount: number; earlyLeaveCount: number; missingClockCount: number;
  missingReportCount: number; totalViolations: number; reprimandRequired: boolean;
}

// 월간 리포트 링크를 이메일(우선) 또는 문자로 발송한다. 반환: 사용된 채널.
export async function sendReportLink(opts: {
  name: string; email?: string | null; phone?: string | null; monthLabel: string; link: string;
  corpName?: string; over?: boolean; deadlineText?: string; managers?: { name: string; phone: string }[];
}): Promise<'email' | 'sms' | 'none'> {
  const { name, email, phone, monthLabel, link, corpName = '', over = false, deadlineText = '', managers = [] } = opts;
  const RED = '#cb6156';
  const subject = `[${monthLabel}월 근태관리 리포트 안내]`;
  const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);

  // 한 법인에 담당자가 여러 명이면 모두 표기
  const mgrHtml = managers.map((m) => `${esc(m.name)} 담당자 (☎ ${esc(m.phone)})`).join('<br>');
  const signature =
    `<p style="margin:18px 0 0;">감사합니다.</p>` +
    (mgrHtml ? `<p style="margin:14px 0 0;">${mgrHtml}</p>` : '');
  const linkLine = `<p style="margin:14px 0 0;"><a href="${link}">📄 ${monthLabel}월 근태관리 리포트 열기</a></p>`;

  const reprimandLine = over
    ? `<p style="margin:12px 0 0;color:${RED};">이번 근태 내역과 관련하여 <b>${esc(deadlineText)}</b>까지 시말서를 제출하여 주시기바랍니다.</p>`
    : '';

  const bodyHtml =
    `<div style="font-family:'맑은 고딕',sans-serif;color:#333;font-size:14px;line-height:1.7;">` +
    `<p style="margin:0;">안녕하세요, ${esc(name)}님.<br>${esc(corpName)} 인사팀입니다.</p>` +
    `<p style="margin:14px 0 0;">${monthLabel}월 근태관리 리포트를 보내드립니다.</p>` +
    reprimandLine +
    `<p style="margin:12px 0 0;">근태 현황에 대한 자세한 내용은 TimeCard 개인 애플리케이션에서 확인하실 수 있${over ? '으며, 향후 원활한 근태관리를 위해 관련 규정을 준수하여 주시기 바랍니다.' : '습니다.'}</p>` +
    `<p style="margin:12px 0 0;">문의사항이 있으시면 본 메일에 회신하시거나 아래 연락처로 문의해 주시기 바랍니다.</p>` +
    linkLine + signature + `</div>`;

  const bodyText =
    `안녕하세요, ${name}님.\n${corpName} 인사팀입니다.\n\n${monthLabel}월 근태관리 리포트를 보내드립니다.\n` +
    (over ? `이번 근태 내역과 관련하여 ${deadlineText}까지 시말서를 제출하여 주시기바랍니다.\n` : '') +
    `근태 현황에 대한 자세한 내용은 TimeCard 개인 애플리케이션에서 확인하실 수 있습니다.\n리포트: ${link}\n\n감사합니다.\n` +
    managers.map((m) => `${m.name} 담당자 (☎ ${m.phone})`).join('\n');

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

  // 이메일이 없으면 문자(SOLAPI LMS)
  if (phone && process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SMS_SENDER) {
    await sendSolapiSms(phone, bodyText);
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

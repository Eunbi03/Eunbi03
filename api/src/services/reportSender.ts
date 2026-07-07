import nodemailer from 'nodemailer';

interface ReportData {
  to: string; name: string; yearMonth: string;
  lateCount: number; earlyLeaveCount: number; missingClockCount: number;
  missingReportCount: number; totalViolations: number; reprimandRequired: boolean;
}

// 월간 리포트 링크를 이메일(우선) 또는 문자로 발송한다. 반환: 사용된 채널.
export async function sendReportLink(opts: { name: string; email?: string | null; phone?: string | null; monthLabel: string; link: string }): Promise<'email' | 'sms' | 'none'> {
  const { name, email, phone, monthLabel, link } = opts;
  const subject = `[근태] ${monthLabel} 근태관리 리포트 — ${name}`;
  const body = `${name}님, ${monthLabel} 근태관리 리포트입니다.\n아래 링크에서 확인해 주세요.\n${link}`;

  if (email && process.env.SMTP_HOST && process.env.SMTP_USER) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER, to: email, subject,
      html: `<p>${name}님, ${monthLabel} 근태관리 리포트입니다.</p><p><a href="${link}">리포트 열기</a></p>`,
      text: body,
    });
    return 'email';
  }

  // 이메일이 없으면 문자(SMS) — 제공자 연동 시 여기에 구현
  if (phone && process.env.SMS_API_KEY) {
    console.warn(`[리포트 SMS 미구현] ${name}(${phone}) → ${link}`);
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

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
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

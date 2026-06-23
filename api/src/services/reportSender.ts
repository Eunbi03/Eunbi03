import nodemailer from 'nodemailer';

interface ReportData {
  to: string; name: string; yearMonth: string;
  lateCount: number; earlyLeaveCount: number; missingClockCount: number;
  missingReportCount: number; totalViolations: number; reprimandRequired: boolean;
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

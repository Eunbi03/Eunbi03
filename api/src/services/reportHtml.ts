import { BuiltReport, ReportDay } from './reportBuilder';

const INK = '#333333';
const RED = '#cb6156';
const BLUE = '#2f6d8f';
const LINE = '#d8d8d8';
const HEAD_BG = '#eef3f7';
const REDBG = '#fef5f5';
const DOW_LABEL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

function dayNumColor(d: ReportDay): string {
  if (d.dow === 0 || d.isHol) return RED;
  if (d.dow === 6) return BLUE;
  return INK;
}

function dayBody(d: ReportDay): string {
  if (d.leaveType === '연차') return `<div style="color:${BLUE};font-weight:600;">연차</div>`;
  if (d.missing) return `<div style="color:${RED};font-weight:600;">&#9888; 출근누락</div>`;
  if (d.leaveType) return `<div style="color:${INK};">${esc(d.leaveType.replace('+', ' + '))} 인정</div>`;

  const lines: string[] = [];
  if (d.checkIn) {
    lines.push(`<div style="${d.late ? `color:${RED};font-weight:600;` : `color:${INK};`}">${esc(d.checkIn.time || '')} ${esc(d.checkIn.place)}</div>`);
  }
  for (const o of d.outings) {
    lines.push(`<div style="color:${INK};">${esc(o.time || '')} ${esc(o.place)}</div>`);
  }
  if (d.checkOut) {
    lines.push(`<div style="color:${INK};">${esc(d.checkOut.time || '')} ${esc(d.checkOut.place)}</div>`);
  } else if (d.noOut) {
    lines.push(`<div style="color:${RED};font-weight:600;">퇴근누락</div>`);
  }
  return lines.join('');
}

export function renderReportHtml(r: BuiltReport, sentDate?: string): string {
  const [, m] = r.from.split('-').map(Number);
  const monthLabel = `${m}월`;
  // 시말서 제출 기한: 발송일로부터 +7일
  const baseStr = sentDate || new Date().toISOString().slice(0, 10);
  const deadline = new Date(baseStr + 'T00:00:00Z');
  deadline.setUTCDate(deadline.getUTCDate() + 7);
  const deadlineText = `${deadline.getUTCMonth() + 1}월 ${deadline.getUTCDate()}일`;

  // 달력 셀 배열: 첫 주 앞 빈칸 패딩
  const cells: (ReportDay | null)[] = [];
  if (r.days.length) for (let i = 0; i < r.days[0].dow; i++) cells.push(null);
  cells.push(...r.days);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    rows.push('<tr>' + week.map((d) => {
      if (!d) return `<td style="border:1px solid ${LINE};height:96px;vertical-align:top;"></td>`;
      const bg = (d.late || d.missing || d.noOut) ? REDBG : '#fff';
      const holLabel = d.holidayName
        ? `<span style="color:${RED};font-weight:600;font-size:11px;margin-left:4px;">${esc(d.holidayName)}</span>`
        : '';
      return `<td style="border:1px solid ${LINE};height:96px;vertical-align:top;padding:5px 6px;background:${bg};font-size:14px;line-height:1.5;">
        <div style="margin-bottom:2px;"><span style="font-weight:700;color:${dayNumColor(d)};">${Number(d.date.slice(8))}</span>${holLabel}</div>
        ${dayBody(d)}
      </td>`;
    }).join('') + '</tr>');
  }

  const kpi = (label: string, v: number) =>
    `<span style="margin-left:14px;${v > 0 ? `color:${RED};font-weight:600;` : `color:${INK};`}">${label} ${v}</span>`;

  const headRow = DOW_LABEL.map((d, i) =>
    `<th style="border:1px solid ${LINE};background:${HEAD_BG};padding:8px 0;font-weight:600;color:${i === 0 ? RED : i === 6 ? BLUE : INK};font-size:13px;">${d}</th>`
  ).join('');

  const noteMiss = r.noteMissDates.length
    ? `<div style="margin-top:14px;font-size:14px;color:${INK};font-weight:700;">근무노트 누락일 : <span style="color:${RED};">${r.noteMissDates.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`).join(', ')}</span></div>`
    : '';

  const reprimand = r.over
    ? `<div style="margin-top:12px;padding:8px 12px;background:${REDBG};border-radius:6px;display:inline-block;color:${RED};font-weight:600;font-size:14px;">${deadlineText}까지 시말서를 제출하여 주시기바랍니다.</div>`
    : '';

  const org = [r.user.corp, r.user.division, r.user.team].filter(Boolean).join(' · ');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=1000">
<title>${monthLabel} 근태관리 리포트 — ${esc(r.user.name)}</title></head>
<body style="margin:0;background:#f4f4f4;font-family:'맑은 고딕','Malgun Gothic',AppleGothic,sans-serif;color:${INK};">
<div style="max-width:1000px;margin:0 auto;background:#fff;padding:28px 32px 40px;">
  <h1 style="text-align:center;font-size:28px;font-weight:800;margin:0 0 18px;color:${INK};">${monthLabel} 근태관리 리포트</h1>
  <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;margin-bottom:12px;">
    <div style="font-size:15px;color:${INK};"><span style="font-weight:700;">${esc(r.user.name)}</span> <span style="font-size:14px;">${esc(org)}</span></div>
    <div style="font-size:14px;">${kpi('지각', r.kpi.lateCount)}${kpi('출근누락', r.kpi.missingIn)}${kpi('퇴근누락', r.kpi.missingOut)}${kpi('노트누락', r.kpi.missingNote)}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <thead><tr>${headRow}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  ${noteMiss}
  ${reprimand}
  <div style="margin-top:18px;font-size:12px;color:#888;">* 자세한 내용은 TimeCard 어플리케이션 내에서 확인해 주세요.</div>
</div>
</body></html>`;
}

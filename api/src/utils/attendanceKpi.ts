// 근태 KPI(지각·출퇴근누락·노트누락) 판정 공통 로직.
// overview / individual-report / weekly-summary / monthly-summary 가 동일한 기준을 쓰도록 한 곳에서 정의한다.
//
// leave_type(관리자가 수동 인정한 처리)은 실제 출근/퇴근/노트를 대체한다:
//   - 출근 인정: '출근' | '출퇴근' | '출근+노트' | '출퇴근+노트'
//   - 퇴근 인정: '퇴근' | '출퇴근' | '퇴근+노트' | '출퇴근+노트'
//   - 노트 인정: '노트' | (…+노트)

export const leaveCountsAsCheckIn = (lt: string | null): boolean =>
  lt === '출근' || lt === '출퇴근' || lt === '출근+노트' || lt === '출퇴근+노트';

export const leaveCountsAsCheckOut = (lt: string | null): boolean =>
  lt === '퇴근' || lt === '출퇴근' || lt === '퇴근+노트' || lt === '출퇴근+노트';

export const leaveCountsAsNote = (lt: string | null): boolean =>
  lt === '노트' || (!!lt && lt.includes('+노트'));

export interface DayKpi {
  isLeave: boolean;      // 연차 — KPI 집계에서 제외
  present: boolean;      // 출근으로 인정되는가(실제 출근 또는 출근 인정 leave_type)
  isLate: boolean;       // 지각 (출근 인정 leave_type인 경우 제외)
  isEarlyLeave: boolean; // 조퇴
  missingOut: boolean;   // 출근했으나 퇴근(또는 퇴근 인정)이 없음
  missingNote: boolean;  // 퇴근은 있으나 업무노트가 없음
}

// 하루치 출퇴근 기록(없으면 undefined)을 받아 KPI 판정 결과를 반환한다.
// missingIn(출근누락)은 "근무일인데 미출근"이라는 날짜 맥락이 필요하므로 호출부에서 (!present && 근무일)로 판단한다.
export function classifyDay(r: any): DayKpi {
  const lt: string | null = r?.leave_type ?? null;
  if (lt === '연차') {
    return { isLeave: true, present: false, isLate: false, isEarlyLeave: false, missingOut: false, missingNote: false };
  }
  const hasIn = Boolean(r?.check_in_time);
  const present = hasIn || leaveCountsAsCheckIn(lt);
  if (!present) {
    return { isLeave: false, present: false, isLate: false, isEarlyLeave: false, missingOut: false, missingNote: false };
  }
  const isLate = (r?.status === '지각' || r?.status === '지각조퇴') && !leaveCountsAsCheckIn(lt);
  const isEarlyLeave = r?.status === '조퇴' || r?.status === '지각조퇴';
  const hasOut = Boolean(r?.check_out_time) || leaveCountsAsCheckOut(lt);
  const missingOut = !hasOut;
  const missingNote = hasOut && !r?.work_note_today && !r?.daily_report && !leaveCountsAsNote(lt);
  return { isLeave: false, present: true, isLate, isEarlyLeave, missingOut, missingNote };
}

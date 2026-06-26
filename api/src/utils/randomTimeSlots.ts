function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 하루 3회 랜덤 위치 확인 시간 생성 규칙:
 * - 오전(workStart~lunchStart) / 오후(lunchEnd~workEnd) 중 한 쪽 2회, 다른 쪽 1회 (어느 쪽이 2번인지 랜덤)
 * - 같은 half 내 두 슬롯은 최소 minGapMinutes(기본 120분) 간격
 * - window가 너무 짧으면 가능한 만큼만 생성 (반차 등)
 */
export function generateRandomMinuteOffsets(params: {
  workStart: string; workEnd: string;
  lunchStart?: string; lunchEnd?: string;
  slotCount?: number; minGapMinutes?: number;
  randomFn?: () => number;
}): number[] {
  const { workStart, workEnd, lunchStart, lunchEnd, minGapMinutes = 120, randomFn = Math.random } = params;

  const workStartMin = toMinutes(workStart);
  const workEndMin   = toMinutes(workEnd);

  // 오전/오후 경계 (점심 없으면 12:00/13:00 기본값)
  const morningEnd       = lunchStart ? Math.min(toMinutes(lunchStart), workEndMin) : Math.min(toMinutes('12:00'), workEndMin);
  const afternoonStartMin = lunchEnd  ? Math.max(toMinutes(lunchEnd), workStartMin) : Math.max(toMinutes('13:00'), workStartMin);
  const afternoonEnd     = workEndMin;

  // 슬롯 1개 뽑기 (window 안 임의 위치)
  const pick1 = (s: number, e: number, rng: () => number): number[] => {
    if (e - s <= 0) return [];
    return [s + Math.floor(rng() * (e - s))];
  };

  // 슬롯 2개 뽑기 (최소 gap 보장, 불가능하면 1개 또는 0개)
  const pick2 = (s: number, e: number, gap: number, rng: () => number): number[] => {
    const duration = e - s;
    if (duration <= 0) return [];
    if (duration < gap + 1) {
      // window too small for 2 with gap — pick 1 if any space
      return pick1(s, e, rng);
    }
    // first slot in [s, e - gap)
    const maxFirst = e - gap - 1;
    const first = s + Math.floor(rng() * (maxFirst - s + 1));
    // second slot in [first + gap, e)
    const secondStart = first + gap;
    const second = secondStart + Math.floor(rng() * (e - secondStart));
    return [first, second];
  };

  const morningGets2 = randomFn() < 0.5;

  const morningSlots   = morningGets2
    ? pick2(workStartMin, morningEnd,       minGapMinutes, randomFn)
    : pick1(workStartMin, morningEnd,       randomFn);
  const afternoonSlots = morningGets2
    ? pick1(afternoonStartMin, afternoonEnd, randomFn)
    : pick2(afternoonStartMin, afternoonEnd, minGapMinutes, randomFn);

  return [...morningSlots, ...afternoonSlots].sort((a, b) => a - b);
}

export function offsetsToDateTimes(dateStr: string, minuteOffsets: number[]): Date[] {
  return minuteOffsets.map((m) => {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    d.setMinutes(d.getMinutes() + m);
    return d;
  });
}

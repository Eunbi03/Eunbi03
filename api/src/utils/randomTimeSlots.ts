function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function generateRandomMinuteOffsets(params: {
  workStart: string; workEnd: string;
  lunchStart: string; lunchEnd: string;
  slotCount?: number; minGapMinutes?: number;
  randomFn?: () => number;
}): number[] {
  const { workStart, workEnd, lunchStart, lunchEnd, slotCount = 3, minGapMinutes = 30, randomFn = Math.random } = params;
  const start = toMinutes(workStart);
  const end = toMinutes(workEnd);
  const lunchS = toMinutes(lunchStart);
  const lunchE = toMinutes(lunchEnd);

  const available: number[] = [];
  for (let m = start; m < end; m++) {
    if (!(m >= lunchS && m < lunchE)) available.push(m);
  }

  const selected: number[] = [];
  let attempts = 0;
  while (selected.length < slotCount && attempts < 2000) {
    attempts++;
    const candidate = available[Math.floor(randomFn() * available.length)];
    if (!selected.some((m) => Math.abs(m - candidate) < minGapMinutes)) selected.push(candidate);
  }

  while (selected.length < slotCount) {
    const candidate = available[Math.floor(randomFn() * available.length)];
    if (!selected.includes(candidate)) selected.push(candidate);
  }

  return selected.sort((a, b) => a - b);
}

export function offsetsToDateTimes(dateStr: string, minuteOffsets: number[]): Date[] {
  return minuteOffsets.map((m) => {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    d.setMinutes(d.getMinutes() + m);
    return d;
  });
}

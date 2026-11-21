export type TimerTone = 'green' | 'yellow' | 'red';

/** Xanh → vàng → đỏ khi sắp hết giờ (≤ 20% hoặc ≤ 10 giây). */
export function timerTone(remaining: number, total: number): TimerTone {
  if (total <= 0) return 'green';
  const fraction = remaining / total;
  if (remaining <= 10 || fraction <= 0.2) return 'red';
  if (fraction <= 0.5) return 'yellow';
  return 'green';
}

export const timerFraction = (remaining: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(1, remaining / total));

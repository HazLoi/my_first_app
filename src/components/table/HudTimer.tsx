import { useEffect, useRef } from 'react';
import { useCountdown } from '@/hooks/useTable';
import { playSound } from '@/services/sound';
import { timerFraction, timerTone } from './timer';

interface HudTimerProps {
  startedAt: number;
  deadline: number | null;
  /** Phát tiếng tick mỗi giây khi còn ≤ 5 giây. */
  tick?: boolean;
}

/** Thanh thời gian xếp bài (ngang, giữa trên): xanh → vàng → đỏ, đếm ngược theo giờ server. */
export function HudTimer({ startedAt, deadline, tick = true }: HudTimerProps) {
  const remaining = useCountdown(deadline);
  const total = deadline ? Math.max(1, (deadline - startedAt) / 1000) : 0;
  const tone = timerTone(remaining, total);
  const seconds = Math.ceil(remaining);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    if (!tick || !deadline || seconds > 5 || seconds <= 0 || lastTick.current === seconds) return;
    lastTick.current = seconds;
    playSound('tick');
  }, [seconds, tick, deadline]);

  if (!deadline) return null;
  return (
    <div className={`hud-timer hud-timer-${tone}`} role="timer" aria-label={`${seconds}`}>
      <div className="hud-timer-fill" style={{ width: `${timerFraction(remaining, total) * 100}%` }} />
      <span className="hud-timer-text">{seconds}</span>
    </div>
  );
}

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { RULES } from '@/config/rules';
import { gateway } from '@/services';
import type { TableState } from '@/services/types';
import { flatProjection, perspectiveProjection, type Projection } from '@/three/camera';
import { nextRevealChange, revealStageAt } from './tableView';

export const ProjectionContext = createContext<Projection>(perspectiveProjection);
export const useProjection = (): Projection => useContext(ProjectionContext);
export { flatProjection, perspectiveProjection };

/** Số chạy (count-up) về `value`; lần mount đầu hiển thị ngay giá trị, không chạy từ 0. */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return undefined;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      const p = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

/** Chi đang hiện trong phase revealing (0..3), đồng bộ theo phaseStartedAt và giờ server. */
export function useRevealStage(table: TableState | null): number {
  const phase = table?.phase;
  const startedAt = table?.phaseStartedAt ?? 0;
  const deadline = table?.phaseDeadline ?? null;
  const total = deadline && startedAt ? (deadline - startedAt) / 1000 : RULES.phaseSeconds.revealing;
  const [stage, setStage] = useState(() => (phase === 'scoring' || phase === 'summary' || phase === 'next' ? 3 : 0));

  useEffect(() => {
    if (phase === 'scoring' || phase === 'summary' || phase === 'next') {
      setStage(3);
      return undefined;
    }
    if (phase !== 'revealing') {
      setStage(0);
      return undefined;
    }
    let timer: number | undefined;
    const tick = (): void => {
      const elapsed = (gateway().serverNow() - startedAt) / 1000;
      setStage(revealStageAt(elapsed, total));
      const wait = nextRevealChange(elapsed, total);
      if (wait !== null) timer = window.setTimeout(tick, Math.max(40, wait * 1000 + 20));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [phase, startedAt, total]);
  return stage;
}

/** Hiện giá trị trong `ms` rồi tự ẩn (dùng cho thông báo ngắn). */
export function useTransient<T>(ms: number): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return undefined;
    const timer = window.setTimeout(() => setValue(null), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return [value, setValue];
}

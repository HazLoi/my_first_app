import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '@/game-logic';
import { suggestAsync } from '@/game-logic/suggestClient';
import { t } from '@/i18n';
import { gateway } from '@/services';
import type { TableState } from '@/services/types';
import { playSound } from '@/services/sound';
import {
  analyze,
  fromArrangement,
  initialState,
  placedCount,
  rankArrangement,
  toArrangement,
  type ArrangeAnalysis,
  type ArrangeState,
} from './arrange';

export interface ArrangeNotice {
  text: string;
  tone: 'info' | 'warn';
  id: number;
}

export interface ArrangeController {
  cards: Card[];
  state: ArrangeState;
  setState(updater: (previous: ArrangeState) => ArrangeState): void;
  analysis: ArrangeAnalysis;
  /** Đã khóa (đã Xong hoặc hết phase xếp bài). */
  locked: boolean;
  submitted: boolean;
  busy: boolean;
  notice: ArrangeNotice | null;
  /** Tăng mỗi lần bấm Xong mà bài lủng để chạy hiệu ứng rung. */
  foulPulse: number;
  hint(): void;
  done(): void;
  reshuffle(): void;
}

let noticeId = 1;

/** Toàn bộ trạng thái xếp bài của bạn: khay/3 chi, gợi ý xoay vòng, nộp bài (optimistic), khôi phục khi vào lại. */
export function useArrange(table: TableState | null): ArrangeController {
  const cards = useMemo(() => table?.cards ?? [], [table?.cards]);
  const round = table?.round ?? 0;
  const handKey = `${round}:${cards.map((card) => card.id).join(',')}`;
  const serverArrangement = table?.arrangement ?? null;
  const arrangementKey = serverArrangement ? JSON.stringify(serverArrangement) : '';

  const fresh = useMemo(
    () => (serverArrangement && cards.length ? fromArrangement(cards, serverArrangement) : initialState(cards)),
    // Chỉ dựng lại khi đổi tay bài (ván mới / vào lại).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handKey],
  );
  const [store, setStore] = useState<{ key: string; state: ArrangeState }>({ key: handKey, state: fresh });
  const state = store.key === handKey ? store.state : fresh;

  const [localSubmitted, setLocalSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ArrangeNotice | null>(null);
  const [foulPulse, setFoulPulse] = useState(0);
  const hintRef = useRef<{ key: string; list: Awaited<ReturnType<typeof suggestAsync>>; index: number } | null>(null);

  useEffect(() => {
    setLocalSubmitted(false);
    setNotice(null);
    hintRef.current = null;
  }, [handKey]);

  const phase = table?.phase;
  const serverSubmitted = Boolean(table?.submitted);
  useEffect(() => {
    // Server tự xếp (hết giờ) hoặc dựng lại bài đã nộp khi vào lại: hiển thị đúng bài đó.
    if (!serverArrangement || cards.length === 0) return;
    if (serverSubmitted || phase !== 'arranging') {
      setStore({ key: handKey, state: fromArrangement(cards, serverArrangement) });
    }
  }, [arrangementKey, serverSubmitted, phase, handKey, cards, serverArrangement]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const submitted = serverSubmitted || localSubmitted;
  const locked = submitted || phase !== 'arranging' || cards.length === 0;
  const analysis = useMemo(() => analyze(state, cards), [state, cards]);
  const say = useCallback((text: string, tone: ArrangeNotice['tone'] = 'info') => setNotice({ text, tone, id: noticeId++ }), []);

  const setState = useCallback(
    (updater: (previous: ArrangeState) => ArrangeState) => setStore({ key: handKey, state: updater(state) }),
    [handKey, state],
  );

  const hint = useCallback(() => {
    if (locked || busy || cards.length !== 13) return;
    const apply = (cache: NonNullable<typeof hintRef.current>): void => {
      cache.index = (cache.index + 1) % cache.list.length;
      const suggestion = cache.list[cache.index];
      if (!suggestion) return;
      setStore({ key: handKey, state: fromArrangement(cards, suggestion.arrangement) });
      say(t('table.hintApplied', { index: cache.index + 1, total: cache.list.length }));
      playSound('click');
    };
    const cached = hintRef.current;
    if (cached && cached.key === handKey) {
      apply(cached);
      return;
    }
    setBusy(true);
    say(t('table.hintWorking'));
    suggestAsync(cards, 5)
      .then((list) => {
        const cache = { key: handKey, list, index: -1 };
        hintRef.current = cache;
        apply(cache);
      })
      .catch(() => say(t('table.hintFailed'), 'warn'))
      .finally(() => setBusy(false));
  }, [locked, busy, cards, handKey, say]);

  const done = useCallback(() => {
    if (locked || busy || !table) return;
    const arrangement = toArrangement(state);
    if (!arrangement) {
      say(t('table.needAll'), 'warn');
      return;
    }
    if (analysis.foul) {
      const detail =
        analysis.frontMiddle && analysis.middleBack
          ? t('table.foulBoth')
          : analysis.frontMiddle
            ? t('table.foulFrontMiddle')
            : t('table.foulMiddleBack');
      say(t('table.foul', { detail }), 'warn');
      setFoulPulse((value) => value + 1);
      playSound('lose');
      return;
    }
    setLocalSubmitted(true);
    setBusy(true);
    playSound('click');
    gateway()
      .submitArrangement(table.code, arrangement)
      .catch((error: unknown) => {
        setLocalSubmitted(false);
        say(t('table.submitFailed', { message: error instanceof Error ? error.message : String(error) }), 'warn');
      })
      .finally(() => setBusy(false));
  }, [locked, busy, table, state, analysis, say]);

  const reshuffle = useCallback(() => {
    if (locked) return;
    playSound('click');
    setStore({ key: handKey, state: placedCount(state) > 0 ? initialState(cards) : rankArrangement(cards) });
  }, [locked, state, cards, handKey]);

  return { cards, state, setState, analysis, locked, submitted, busy, notice, foulPulse, hint, done, reshuffle };
}

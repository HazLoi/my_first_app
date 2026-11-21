// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { useTableStore } from '@/store/tableStore';
import type { TableState } from '@/services/types';
import { TienLenScreen } from './TienLenScreen';

const mocks = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('@/hooks/useTable', () => ({ useTable: () => undefined, useCountdown: () => 10 }));
vi.mock('@/services', () => ({ gateway: () => ({ tienLenAction: mocks.action, serverNow: () => 0 }) }));
vi.mock('@/services/sound', () => ({ playSound: vi.fn() }));
vi.mock('@/components/Stage', () => ({
  Stage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useViewportMetrics: () => ({ scale: 1 / 3 }),
}));

it('đánh lạc quan và trả bài khi server từ chối', async () => {
  const state: TableState = {
    code: 'ABCDE', gameType: 'tienlen', hostId: 'p1', stake: 50, maxPlayers: 2, hasPassword: false, autoPlay: true,
    phase: 'playing', phaseStartedAt: 0, phaseDeadline: 20000, round: 1, version: 1, selfId: 'p1', cards: [],
    players: [
      { id: 'p1', name: 'An', seat: 1, balance: 1000, submitted: false, spectator: false, left: false, cardCount: 2 },
      { id: 'p2', name: 'Bình', seat: 2, balance: 1000, submitted: false, spectator: false, left: false, cardCount: 2 },
    ],
    arrangement: null, submitted: false, balance: 1000, results: null, cancelled: false,
    tienlen: {
      cards: [{ rank: 3, suit: 'spades' }, { rank: 4, suit: 'hearts' }], turn: 'p1', table: null, lastPlayer: null,
      passed: [], ranking: [], events: [], required: { rank: 3, suit: 'spades' }, results: null, chopRules: {}, turnSeconds: 20,
    },
  };
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  useTableStore.getState().reset('ABCDE');
  useTableStore.getState().applyState(state);
  let reject!: (error: Error) => void;
  mocks.action.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><TienLenScreen /></MemoryRouter>));
  const card = host.querySelector<HTMLElement>('[data-tl-card="3-spades"]')!;
  await act(async () => card.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  const play = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Đánh')!;
  expect(play.disabled).toBe(false);
  expect(play.parentElement!.style.getPropertyValue('--tl-touch')).toBe('132px');
  await act(async () => play.click());
  expect(host.querySelector('[data-tl-card="3-spades"]')).toBeNull();
  await act(async () => reject(new Error('Bài không hợp lệ')));
  expect(host.querySelector('[data-tl-card="3-spades"]')).not.toBeNull();
  expect(host.textContent).toContain('Bài không hợp lệ');
  await act(async () => root.unmount());
  host.remove();
});

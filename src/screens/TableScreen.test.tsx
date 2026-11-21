// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoArrange, createDeck } from '@/game-logic';
import type { TableState, TableSubscription } from '@/services/types';
import { useSettingsStore } from '@/store/settingsStore';
import { TableScreen } from './TableScreen';

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  start: vi.fn(),
  submit: vi.fn(),
  leave: vi.fn(),
  suggest: vi.fn(),
}));

vi.mock('@/services', () => ({
  gateway: () => ({
    kind: 'polling',
    capabilities: { chat: false, emoji: false },
    subscribeTable: mocks.subscribe,
    startRound: mocks.start,
    submitArrangement: mocks.submit,
    leaveTable: mocks.leave,
    serverNow: () => Date.now(),
  }),
}));
vi.mock('@/game-logic/suggestClient', () => ({ suggestAsync: mocks.suggest }));
vi.mock('@/services/sound', () => ({ playSound: vi.fn() }));

const cards = createDeck().slice(0, 13);
const arrangement = autoArrange(cards).arrangement;
const waiting: TableState = {
  code: 'ABCDE', hostId: 'p1', stake: 50, maxPlayers: 2, hasPassword: false, autoPlay: true,
  phase: 'waiting', phaseStartedAt: Date.now(), phaseDeadline: null, round: 0, version: 1,
  players: [
    { id: 'p1', name: 'An', submitted: false, seat: 1, balance: 10000, spectator: false, left: false },
    { id: 'p2', name: 'Bình', submitted: false, seat: 2, balance: 10000, spectator: false, left: false },
  ],
  selfId: 'p1', cards: [], arrangement: null, submitted: false, balance: 10000, results: null, cancelled: false,
};

let root: Root;
let host: HTMLDivElement;
let subscription: TableSubscription;

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe('TableScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    Object.defineProperty(screen, 'orientation', { configurable: true, value: {} });
    useSettingsStore.setState({ flat2D: true, soundOn: false });
    mocks.subscribe.mockImplementation((_code: string, listener: TableSubscription) => {
      subscription = listener;
      listener.onState(waiting);
      return () => undefined;
    });
    mocks.start.mockResolvedValue(waiting);
    mocks.leave.mockResolvedValue(undefined);
    mocks.submit.mockResolvedValue(undefined);
    mocks.suggest.mockResolvedValue([{ arrangement }]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('lets the host start a room and leave through confirmation', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/table/ABCDE']}><Routes>
      <Route path="/table/:id" element={<TableScreen />} />
      <Route path="/lobby" element={<div>Lobby</div>} />
    </Routes></MemoryRouter>));
    expect(host.textContent).toContain('Chờ người chơi (2/2)');
    await act(async () => button('Bắt đầu').click());
    expect(mocks.start).toHaveBeenCalledWith('ABCDE');
    await act(async () => button('Thoát bàn').click());
    expect(host.textContent).toContain('Bạn muốn rời bàn này?');
    await act(async () => button('Thoát').click());
    expect(mocks.leave).toHaveBeenCalledWith('ABCDE');
    expect(host.textContent).toContain('Lobby');
  });

  it('prevents incomplete submission, then sends a suggested arrangement', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/table/ABCDE']}><Routes>
      <Route path="/table/:id" element={<TableScreen />} />
    </Routes></MemoryRouter>));
    await act(async () => subscription.onState({
      ...waiting, phase: 'arranging', round: 1, version: 2, cards,
      phaseStartedAt: Date.now(), phaseDeadline: Date.now() + 60_000,
    }));
    expect(host.querySelectorAll('.arrange-card')).toHaveLength(13);
    await act(async () => button('Xong').click());
    expect(host.textContent).toContain('Hãy xếp đủ 13 lá');
    expect(mocks.submit).not.toHaveBeenCalled();
    await act(async () => button('Gợi ý').click());
    expect(host.textContent).toContain('Gợi ý 1/1');
    await act(async () => button('Xong').click());
    expect(mocks.submit).toHaveBeenCalledWith('ABCDE', arrangement);
    expect(button('Xong').disabled).toBe(true);
  });

  it('unlocks the hand and shows the server error when submission fails', async () => {
    mocks.submit.mockRejectedValue(new Error('Máy chủ từ chối bài'));
    await act(async () => root.render(<MemoryRouter initialEntries={['/table/ABCDE']}><Routes>
      <Route path="/table/:id" element={<TableScreen />} />
    </Routes></MemoryRouter>));
    await act(async () => subscription.onState({
      ...waiting, phase: 'arranging', round: 1, version: 2, cards,
      phaseStartedAt: Date.now(), phaseDeadline: Date.now() + 60_000,
    }));
    await act(async () => button('Gợi ý').click());
    await act(async () => button('Xong').click());
    expect(host.textContent).toContain('Máy chủ từ chối bài');
    expect(button('Xong').disabled).toBe(false);
  });
});

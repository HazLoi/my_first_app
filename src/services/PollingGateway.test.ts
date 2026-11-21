// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PollingGateway, normalizeSnapshot, type RawSnapshot } from './PollingGateway';
import type { ConnectionStatus, TableState } from './types';

type Reply = { status?: number; body: unknown; delayMs?: number } | 'network-error';

const room = (overrides: Record<string, unknown> = {}) => ({
  code: 'ABCDE',
  hostId: 'p1',
  stake: 50,
  started: true,
  finished: false,
  maxPlayers: 4,
  hasPassword: false,
  autoPlay: true,
  phase: 'arranging',
  phaseStartedAt: 1_000,
  phaseDeadline: 61_000,
  round: 1,
  players: [
    { id: 'p1', name: 'An', submitted: false, seat: 1, balance: 1000, spectator: false, left: false },
    { id: 'p2', name: 'Bình', submitted: false, seat: 2, balance: 1000, spectator: false, left: false },
  ],
  ...overrides,
});

const snapshot = (version: number, overrides: Record<string, unknown> = {}, roomOverrides = {}): RawSnapshot =>
  ({
    serverTime: 5_000,
    version,
    room: room(roomOverrides),
    playerId: 'p1',
    cards: [],
    arrangement: null,
    submitted: false,
    balance: 1000,
    results: null,
    ...overrides,
  }) as RawSnapshot;

function mockFetch(replies: Reply[]) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    const reply = replies.shift() ?? { body: { changed: false, version: 1, serverTime: 5_000 } };
    if (reply === 'network-error') throw new TypeError('Failed to fetch');
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    const status = reply.status ?? 200;
    return {
      ok: status < 400,
      status,
      headers: { get: () => null },
      json: async () => reply.body,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
};

const stops: Array<() => void> = [];
function track(gateway: PollingGateway, code: string, subscription: Parameters<PollingGateway['subscribeTable']>[1]) {
  const stop = gateway.subscribeTable(code, subscription);
  stops.push(stop);
  return stop;
}

describe('PollingGateway.subscribeTable', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('zp_session', JSON.stringify({ token: 't'.repeat(43), user: { id: 'u' } }));
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gửi since_version, nhận {changed:false} nhẹ và chỉ cập nhật khi version đổi', async () => {
    const calls = mockFetch([
      { body: snapshot(3) },
      { body: { changed: false, version: 3, serverTime: 6_000 } },
      { body: snapshot(4, {}, { phase: 'revealing' }) },
    ]);
    const states: TableState[] = [];
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: (state) => states.push(state) });
    await vi.advanceTimersByTimeAsync(10);
    expect(states).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/rooms\/ABCDE\?game_type=xapxam&chat_since_id=0$/);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls[1]!.url).toMatch(/since_version=3/);
    expect(states).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(states).toHaveLength(2);
    expect(states[1]!.phase).toBe('revealing');
    expect(states[1]!.version).toBe(4);
    expect(calls[2]!.url).toMatch(/since_version=3/);
    stop();
  });

  it('giữ chế độ tính điểm khi đọc danh sách bàn', async () => {
    mockFetch([{ body: { rooms: [{
      code: 'ABCDE', hostName: 'An', playerCount: 1, stake: 50, scoringMode: 'points',
    }] } }]);
    const tables = await new PollingGateway().listTables('tienlen');
    expect(tables[0]?.scoringMode).toBe('points');
  });

  it('lỗi mạng: backoff 1s, 2s, 4s…, hiện reconnecting rồi tự phục hồi', async () => {
    const calls = mockFetch(['network-error', 'network-error', 'network-error', { body: snapshot(1) }]);
    const statuses: ConnectionStatus[] = [];
    const states: TableState[] = [];
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: (s) => states.push(s), onStatus: (s) => statuses.push(s) });
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(980); // t = 990ms
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20); // t = 1010ms: lần thử lại sau 1s
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1980); // t = 2990ms
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20); // t = 3010ms: sau 2s
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3980); // t = 6990ms
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(20); // t = 7010ms: sau 4s
    expect(calls).toHaveLength(4);
    expect(statuses).toEqual(['reconnecting', 'offline', 'online']);
    expect(states).toHaveLength(1);
    stop();
  });

  it('backoff không vượt quá 10 giây', async () => {
    const calls = mockFetch(Array.from({ length: 8 }, () => 'network-error' as Reply));
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: () => undefined });
    await vi.advanceTimersByTimeAsync(1 + 1000 + 2000 + 4000 + 8000 + 10_000 + 10_000);
    expect(calls.length).toBe(7);
    stop();
  });

  it('tạm dừng khi tab ẩn và poll ngay khi tab hiện lại', async () => {
    const calls = mockFetch([{ body: snapshot(1) }]);
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: () => undefined });
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toHaveLength(1);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(5);
    expect(calls).toHaveLength(2);
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toHaveLength(2);
  });

  it('403 → onClosed(kicked); 404 → onClosed(gone) và dừng poll', async () => {
    const calls = mockFetch([{ status: 403, body: { error: 'Tài khoản của bạn không thuộc phòng này.' } }]);
    const closed: string[] = [];
    const gateway = new PollingGateway();
    track(gateway, 'ABCDE', { onState: () => undefined, onClosed: (reason) => closed.push(reason) });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(closed).toEqual(['kicked']);
    expect(calls).toHaveLength(1);
  });

  it('đồng bộ đồng hồ theo serverTime (độ lệch + nửa RTT)', async () => {
    vi.setSystemTime(100_000);
    mockFetch([{ body: snapshot(1, { serverTime: 130_000 }) }]);
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: () => undefined });
    await vi.advanceTimersByTimeAsync(10);
    // Server nhanh hơn client ~30s.
    expect(gateway.serverNow() - Date.now()).toBeGreaterThan(29_000);
    expect(gateway.serverNow() - Date.now()).toBeLessThan(31_000);
    stop();
  });

  it('optimistic: hiện submitted ngay, rollback khi server từ chối', async () => {
    const calls = mockFetch([
      { body: snapshot(1) },
      { status: 400, body: { error: 'Binh lủng: chi cuối phải mạnh hơn chi giữa, chi giữa mạnh hơn chi đầu.' }, delayMs: 200 },
    ]);
    const states: TableState[] = [];
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: (s) => states.push(s) });
    await vi.advanceTimersByTimeAsync(10);
    const arrangement = { front: ['a'], middle: ['b'], back: ['c'] };
    const promise = gateway.submitArrangement('ABCDE', arrangement);
    const assertion = expect(promise).rejects.toThrow('Binh lủng');
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)!.submitted).toBe(true);
    expect(states.at(-1)!.arrangement).toEqual(arrangement);
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
    expect(states.at(-1)!.submitted).toBe(false);
    expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/rooms/ABCDE/submit'))).toBe(true);
    stop();
  });

  it('bỏ qua snapshot cũ hơn version đã biết', async () => {
    mockFetch([{ body: snapshot(5) }, { body: snapshot(4, {}, { phase: 'waiting' }) }]);
    const states: TableState[] = [];
    const gateway = new PollingGateway();
    const stop = track(gateway, 'ABCDE', { onState: (s) => states.push(s) });
    await vi.advanceTimersByTimeAsync(1100);
    expect(states.map((s) => s.version)).toEqual([5]);
    stop();
  });

  it('nhận trạng thái Tiến Lên và gửi action theo phiên bản polling', async () => {
    localStorage.setItem('zp_selected_game', 'tienlen');
    const raw = {
      serverTime: 5000, version: 3, playerId: 'p1',
      room: { code: 'ABCDE', gameType: 'tienlen', hostId: 'p1', stake: 50, phase: 'playing', deadline: 25000, round: 1,
        players: [{ id: 'p1', name: 'An', seat: 1, balance: 1000, cardCount: 1 }, { id: 'p2', name: 'Bình', seat: 2, balance: 900, cardCount: 5 }] },
      cards: [{ rank: 3, suit: 'spades' as const }], turn: 'p1', table: null, lastPlayer: null,
      passed: [], ranking: [], events: [], required: { rank: 3, suit: 'spades' as const }, results: null,
      chopRules: { four: ['single_two'] }, turnSeconds: 20,
    };
    const calls = mockFetch([{ body: raw }, { body: { ...raw, version: 4, cards: [], turn: 'p2' } }]);
    const states: TableState[] = [];
    const gateway = new PollingGateway();
    track(gateway, 'ABCDE', { onState: (state) => states.push(state) });
    await vi.advanceTimersByTimeAsync(10);
    expect(states[0]!.phase).toBe('playing');
    expect(states[0]!.phaseDeadline).toBe(25000);
    expect(states[0]!.players[1]!.cardCount).toBe(5);
    expect(states[0]!.tienlen!.cards).toEqual(raw.cards);
    const request = gateway.tienLenAction('ABCDE', { type: 'play', cards: raw.cards });
    await vi.advanceTimersByTimeAsync(10);
    await request;
    expect(calls[1]!.url).toMatch(/\/rooms\/ABCDE\/action$/);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ type: 'play', cards: raw.cards });
    expect(states.at(-1)!.version).toBe(4);
    expect(states.at(-1)!.tienlen!.cards).toEqual([]);
  });
});

describe('normalizeSnapshot', () => {
  it('phòng cũ (không có phase): suy ra waiting/arranging/summary; arrangement dạng lá bài → id', () => {
    const legacyWaiting = normalizeSnapshot({
      room: { code: 'AAAAA', hostId: 'x', stake: 50, started: false, finished: false, players: [{ id: 'x', name: 'A' }] },
      playerId: 'x',
      cards: [],
      arrangement: null,
      submitted: false,
      balance: 10,
      results: null,
    } as RawSnapshot);
    expect(legacyWaiting.phase).toBe('waiting');
    expect(legacyWaiting.maxPlayers).toBe(4);
    expect(legacyWaiting.players[0]!.seat).toBe(1);

    const card = (id: string) => ({ id, suit: '♠', value: 2, label: '2' });
    const playing = normalizeSnapshot({
      room: { code: 'AAAAA', hostId: 'x', stake: 50, started: true, finished: false, players: [] },
      playerId: 'x',
      cards: [],
      arrangement: { front: [card('a')], middle: [card('b')], back: [card('c')] },
      submitted: true,
      balance: 10,
      results: { stake: 50, round: 0, players: [{ id: 'x', name: 'A', points: 3 }] },
    } as unknown as RawSnapshot);
    expect(playing.phase).toBe('arranging');
    expect(playing.arrangement).toEqual({ front: ['a'], middle: ['b'], back: ['c'] });
    expect(playing.results!.players[0]!.pairs).toEqual([]);
    expect(playing.results!.players[0]!.white).toBeNull();
  });

  describe('PollingGateway.currentTableCode', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('tìm bàn đang tham gia hoặc báo không có bàn', async () => {
      const calls = mockFetch([{ body: { code: 'ABCDE' } }, { body: { code: null } }]);
      const gateway = new PollingGateway();
      await expect(gateway.currentTableCode()).resolves.toBe('ABCDE');
      await expect(gateway.currentTableCode()).resolves.toBeNull();
      expect(calls.map((call) => call.url)).toEqual([
        expect.stringMatching(/\/rooms\/current$/),
        expect.stringMatching(/\/rooms\/current$/),
      ]);
    });

    it('khôi phục đúng game của bàn đang tham gia', async () => {
      localStorage.setItem('zp_selected_game', 'xapxam');
      mockFetch([{ body: { code: 'ABCDE', gameType: 'tienlen' } }]);
      await expect(new PollingGateway().currentTableCode()).resolves.toBe('ABCDE');
      expect(localStorage.getItem('zp_selected_game')).toBe('tienlen');
    });

    it('không nhầm lỗi mạng hoặc dữ liệu sai với việc không có bàn', async () => {
      mockFetch([{ body: {} }, 'network-error']);
      const gateway = new PollingGateway();
      await expect(gateway.currentTableCode()).rejects.toThrow('mã bàn không hợp lệ');
      await expect(gateway.currentTableCode()).rejects.toThrow('Không kết nối được máy chủ');
    });
  });
});

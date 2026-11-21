// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '@/config/rules';
import { autoArrange } from '@/game-logic';
import { MockAuthService } from './mockAuth';
import { MockGateway } from './MockGateway';
import type { Phase, TableState } from './types';

async function loginMock(): Promise<void> {
  const session = await new MockAuthService().register({ phone: '0900000001', password: 'x', displayName: 'Tester', remember: true });
  localStorage.setItem('zp_session', JSON.stringify(session));
}

async function until(read: () => Phase, phase: Phase, maxMs = 30_000): Promise<void> {
  for (let elapsed = 0; elapsed < maxMs && read() !== phase; elapsed += 250) await vi.advanceTimersByTimeAsync(250);
  expect(read()).toBe(phase);
}

describe('MockGateway: máy trạng thái ván chơi với bot', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('chạy trọn ván: waiting → dealing → arranging → revealing → scoring → summary → next → dealing (ván mới sau 3s)', async () => {
    const authPromise = loginMock();
    await vi.advanceTimersByTimeAsync(1000);
    await authPromise;
    const gateway = new MockGateway();
    const initial = await gateway.createTable({ stake: 50, maxPlayers: 3, isPublic: true });
    expect(initial.phase).toBe('waiting');

    const phases: Phase[] = [];
    let latest: TableState = initial;
    gateway.subscribeTable(initial.code, {
      onState(state) {
        latest = state;
        if (phases.at(-1) !== state.phase) phases.push(state.phase);
      },
    });

    await until(() => latest.phase, 'dealing'); // bot vào đủ → tự bắt đầu sau 3s → chia bài
    expect(latest.players).toHaveLength(3);
    expect(latest.cards).toHaveLength(13);
    expect(latest.players.every((player) => !player.submitted)).toBe(true);

    await until(() => latest.phase, 'arranging');
    const mine = autoArrange(latest.cards).arrangement;
    await gateway.submitArrangement(latest.code, mine);
    expect(latest.submitted).toBe(true);

    await until(() => latest.phase, 'revealing'); // bot xếp xong → so bài ngay
    expect(latest.results).not.toBeNull();
    const results = latest.results!;
    expect(results.players.reduce((total, player) => total + (player.chips ?? 0), 0)).toBe(0);
    expect(latest.balance).toBe(results.players.find((p) => p.id === latest.selfId)!.balanceBefore);

    await until(() => latest.phase, 'summary');
    expect(latest.balance).toBe(results.players.find((p) => p.id === latest.selfId)!.balanceAfter);

    await until(() => latest.phase, 'next');
    const nextStarted = Date.now();
    await until(() => latest.phase, 'dealing');
    expect(Date.now() - nextStarted).toBeLessThanOrEqual(RULES.phaseSeconds.next * 1000 + 300);
    expect(latest.round).toBe(2);
    expect(latest.results).toBeNull();
    expect(phases).toEqual(['waiting', 'dealing', 'arranging', 'revealing', 'scoring', 'summary', 'next', 'dealing']);
  });

  it('hết giờ xếp bài: bài của người chơi được tự xếp, không lủng', async () => {
    const authPromise = loginMock();
    await vi.advanceTimersByTimeAsync(1000);
    await authPromise;
    const gateway = new MockGateway();
    const initial = await gateway.createTable({ stake: 50, maxPlayers: 2, isPublic: false });
    let latest: TableState = initial;
    gateway.subscribeTable(initial.code, { onState: (state) => (latest = state) });
    await until(() => latest.phase, 'arranging');
    const arrangingStarted = Date.now();
    await until(() => latest.phase, 'revealing', 70_000);
    expect(Date.now() - arrangingStarted).toBeGreaterThanOrEqual(RULES.phaseSeconds.arranging * 1000 - 300);
    expect(latest.results!.players).toHaveLength(2);
  });

  it('từ chối bài lủng, mật khẩu sai và vào bàn không đủ xu', async () => {
    const authPromise = loginMock();
    await vi.advanceTimersByTimeAsync(1000);
    await authPromise;
    const gateway = new MockGateway();
    const locked = (await gateway.listTables()).find((table) => table.hasPassword)!;
    await expect(gateway.joinTable(locked.code, 'sai')).rejects.toThrow('Sai mật khẩu bàn.');
    const open = await gateway.createTable({ stake: 50, maxPlayers: 2, isPublic: true });
    await expect(gateway.submitArrangement(open.code, { front: [], middle: [], back: [] })).rejects.toThrow();
    await gateway.leaveTable(open.code);
    await expect(gateway.leaveTable(open.code)).resolves.toBeUndefined();
  });
});

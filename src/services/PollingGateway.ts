import { LONG_POLL } from '@/config/env';
import type { ArrangementIds, Card, Pile, PlayerScore } from '@/game-logic';
import { apiFetch } from './apiClient';
import { readSession } from './sessionStore';
import {
  GatewayError,
  type ConnectionStatus,
  type CreateTableOptions,
  type GameGateway,
  type MatchHistoryEntry,
  type Phase,
  type RoundResults,
  type TablePlayer,
  type TableState,
  type TableSubscription,
  type TableSummary,
  type Unsubscribe,
} from './types';

/** Khoảng poll (ms): 1s khi đang trong bàn; backoff 1s,2s,4s… tối đa 10s khi lỗi mạng. */
export const POLL_INTERVAL_MS = 1000;
export const MAX_BACKOFF_MS = 10_000;

const PHASES: readonly Phase[] = ['waiting', 'dealing', 'arranging', 'revealing', 'scoring', 'summary', 'next'];

interface RawPlayer {
  id: string;
  name: string;
  submitted?: boolean;
  seat?: number;
  balance?: number;
  spectator?: boolean;
  left?: boolean;
}

interface RawRoom {
  code: string;
  hostId: string;
  started?: boolean;
  finished?: boolean;
  stake: number;
  cancelled?: boolean;
  cancelMessage?: string;
  maxPlayers?: number;
  hasPassword?: boolean;
  autoPlay?: boolean;
  phase?: Phase;
  phaseStartedAt?: number;
  phaseDeadline?: number | null;
  round?: number;
  players: RawPlayer[];
}

export interface RawSnapshot {
  serverTime?: number;
  version?: number;
  changed?: boolean;
  room: RawRoom;
  playerId: string;
  cards: Card[];
  arrangement: Record<Pile, Array<Card | string>> | null;
  submitted: boolean;
  balance: number;
  results: (Omit<RoundResults, 'players'> & { players: Partial<PlayerScore>[] }) | null;
}

const idOf = (item: Card | string): string => (typeof item === 'string' ? item : item.id);

function derivePhase(room: RawRoom): Phase {
  if (room.phase && PHASES.includes(room.phase)) return room.phase;
  if (room.cancelled || !room.started) return 'waiting';
  return room.finished ? 'summary' : 'arranging';
}

/** Chuẩn hóa JSON snapshot của API PHP (cả phòng cũ lẫn phòng autoPlay) thành TableState. */
export function normalizeSnapshot(raw: RawSnapshot, previousVersion = 0): TableState {
  const room = raw.room;
  const players: TablePlayer[] = room.players.map((player, index) => ({
    id: player.id,
    name: player.name,
    submitted: Boolean(player.submitted),
    seat: player.seat ?? index + 1,
    balance: player.balance ?? 0,
    spectator: Boolean(player.spectator),
    left: Boolean(player.left),
  }));
  const arrangement: ArrangementIds | null = raw.arrangement
    ? {
        front: raw.arrangement.front.map(idOf),
        middle: raw.arrangement.middle.map(idOf),
        back: raw.arrangement.back.map(idOf),
      }
    : null;
  const results: RoundResults | null = raw.results
    ? {
        stake: raw.results.stake,
        round: raw.results.round ?? room.round ?? 0,
        seed: raw.results.seed,
        players: raw.results.players.map(
          (player) =>
            ({
              bonus: 0,
              sapLang: false,
              white: null,
              whiteLabel: null,
              pairs: [],
              ...player,
            }) as PlayerScore,
        ),
      }
    : null;
  return {
    code: room.code,
    hostId: room.hostId,
    stake: room.stake,
    maxPlayers: room.maxPlayers ?? 4,
    hasPassword: Boolean(room.hasPassword),
    autoPlay: Boolean(room.autoPlay),
    phase: derivePhase(room),
    phaseStartedAt: room.phaseStartedAt ?? 0,
    phaseDeadline: room.phaseDeadline ?? null,
    round: room.round ?? 0,
    version: raw.version ?? previousVersion,
    players,
    selfId: raw.playerId,
    cards: raw.cards ?? [],
    arrangement,
    submitted: Boolean(raw.submitted),
    balance: raw.balance,
    results,
    cancelled: Boolean(room.cancelled),
    cancelMessage: room.cancelMessage,
  };
}

class TablePoller {
  version: number | null = null;
  state: TableState | null = null;
  private failures = 0;
  private status: ConnectionStatus = 'online';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private stopped = false;
  /** Số lệnh gửi đi chưa có phản hồi (optimistic update đang chờ). */
  pending = 0;

  constructor(
    private readonly code: string,
    private readonly subscription: TableSubscription,
    private readonly token: () => string | null,
    private readonly onClock: (serverTime: number, rtt: number) => void,
  ) {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    if (this.stopped) return;
    if (document.hidden) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      return;
    }
    // Tab hiện lại: poll ngay.
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.tick();
  };

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.subscription.onStatus?.(status);
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    // Tab ẩn: tạm dừng, visibilitychange sẽ gọi lại.
    if (document.hidden) {
      this.timer = null;
      return;
    }
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  /** Áp dụng state từ phản hồi của lệnh (submit/start...) hoặc từ poll. */
  accept(raw: RawSnapshot): void {
    if (this.stopped) return;
    const next = normalizeSnapshot(raw, this.version ?? 0);
    if (this.version !== null && next.version < this.version) return;
    if (next.cancelled) {
      this.subscription.onClosed?.('cancelled', next.cancelMessage);
    }
    this.version = next.version;
    this.state = next;
    this.subscription.onState(next);
  }

  emitOptimistic(state: TableState): void {
    this.state = state;
    this.subscription.onState(state);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    if (document.hidden) return;
    this.controller?.abort();
    this.controller = new AbortController();
    const query = new URLSearchParams();
    if (this.version !== null) query.set('since_version', String(this.version));
    if (LONG_POLL && this.version !== null) query.set('wait', '1');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    try {
      const { data, serverTime, rtt } = await apiFetch<RawSnapshot>(`/rooms/${this.code}${suffix}`, {
        token: this.token(),
        signal: this.controller.signal,
        timeoutMs: LONG_POLL ? 25_000 : 10_000,
      });
      if (this.stopped) return;
      this.failures = 0;
      this.setStatus('online');
      if (serverTime !== null) this.onClock(serverTime, rtt);
      if (data.changed === false) {
        this.schedule(LONG_POLL ? 0 : POLL_INTERVAL_MS);
        return;
      }
      // Bỏ qua phản hồi cũ khi đang có lệnh optimistic chưa xong (tránh nhấp nháy/rollback giả).
      if (this.pending > 0 && this.version !== null && (data.version ?? 0) <= this.version) {
        this.schedule(POLL_INTERVAL_MS);
        return;
      }
      this.accept(data);
      this.schedule(LONG_POLL ? 0 : POLL_INTERVAL_MS);
    } catch (error) {
      if (this.stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
      const status = error instanceof GatewayError ? error.status : 0;
      if (status === 403 || status === 404 || status === 401) {
        this.subscription.onClosed?.(status === 404 ? 'gone' : 'kicked', (error as GatewayError).message);
        this.stop();
        return;
      }
      this.failures++;
      this.setStatus(this.failures >= 3 ? 'offline' : 'reconnecting');
      this.schedule(Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.failures - 1)));
    }
  }
}

/** Gateway gọi API PHP hiện có bằng HTTP polling (không WebSocket, không Node trên server). */
export class PollingGateway implements GameGateway {
  readonly kind = 'polling' as const;
  readonly capabilities = { chat: false, emoji: false };
  private clockOffset = 0;
  private bestRtt = Infinity;
  private pollers = new Map<string, TablePoller>();

  private token(): string | null {
    return readSession()?.token ?? null;
  }

  private request<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
    return apiFetch<T>(path, { ...init, token: this.token() }).then(({ data, serverTime, rtt }) => {
      if (serverTime !== null) this.updateClock(serverTime, rtt);
      return data;
    });
  }

  /** Đồng bộ đồng hồ: ưu tiên mẫu có RTT nhỏ nhất, còn lại làm mượt dần. */
  updateClock(serverTime: number, rtt: number): void {
    const sample = serverTime + rtt / 2 - Date.now();
    if (rtt <= this.bestRtt * 1.5) {
      this.clockOffset = this.bestRtt === Infinity ? sample : this.clockOffset * 0.7 + sample * 0.3;
      this.bestRtt = Math.min(this.bestRtt, rtt);
    }
  }

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  async listTables(): Promise<TableSummary[]> {
    const data = await this.request<{
      rooms: Array<{
        code: string;
        hostName: string;
        playerCount: number;
        stake: number;
        maxPlayers?: number;
        hasPassword?: boolean;
        phase?: Phase;
        round?: number;
      }>;
    }>('/rooms');
    return data.rooms.map((room) => ({
      code: room.code,
      hostName: room.hostName,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers ?? 4,
      stake: room.stake,
      hasPassword: Boolean(room.hasPassword),
      phase: room.phase ?? 'waiting',
      round: room.round ?? 0,
    }));
  }

  async createTable(options: CreateTableOptions): Promise<TableState> {
    const raw = await this.request<RawSnapshot>('/rooms', {
      method: 'POST',
      body: {
        isPublic: options.isPublic,
        stake: options.stake,
        maxPlayers: options.maxPlayers,
        autoPlay: true,
        ...(options.password ? { password: options.password } : {}),
      },
    });
    return normalizeSnapshot(raw);
  }

  async joinTable(code: string, password?: string): Promise<TableState> {
    const raw = await this.request<RawSnapshot>('/rooms/join', {
      method: 'POST',
      body: { code, ...(password ? { password } : {}) },
    });
    return normalizeSnapshot(raw);
  }

  async quickPlay(stake?: number): Promise<TableState> {
    const raw = await this.request<RawSnapshot>('/rooms/quick', {
      method: 'POST',
      body: stake ? { stake } : {},
    });
    return normalizeSnapshot(raw);
  }

  async leaveTable(code: string): Promise<void> {
    await this.request(`/rooms/${code}/leave`, { method: 'POST', body: {} });
  }

  async startRound(code: string): Promise<TableState> {
    const raw = await this.request<RawSnapshot>(`/rooms/${code}/start`, { method: 'POST', body: {} });
    this.pollers.get(code)?.accept(raw);
    return normalizeSnapshot(raw);
  }

  /** Optimistic: hiện "đã xong" ngay, rollback nếu server từ chối. */
  async submitArrangement(code: string, arrangement: ArrangementIds): Promise<TableState> {
    const poller = this.pollers.get(code);
    const previous = poller?.state ?? null;
    if (poller && previous) poller.emitOptimistic({ ...previous, submitted: true, arrangement });
    if (poller) poller.pending++;
    try {
      const raw = await this.request<RawSnapshot>(`/rooms/${code}/submit`, { method: 'POST', body: { arrangement } });
      poller?.accept(raw);
      return normalizeSnapshot(raw);
    } catch (error) {
      if (poller && previous) poller.emitOptimistic(previous);
      throw error;
    } finally {
      if (poller) poller.pending--;
    }
  }

  async sendChat(): Promise<void> {
    throw new GatewayError('Máy chủ chưa hỗ trợ chat.');
  }

  async sendEmoji(): Promise<void> {
    throw new GatewayError('Máy chủ chưa hỗ trợ biểu cảm.');
  }

  async history(limit = 20): Promise<MatchHistoryEntry[]> {
    const data = await this.request<{
      matches: Array<{ id: string; roomCode: string; playerCount: number; finishedAt: string; points: number; seed?: string; round?: number }>;
    }>(`/matches?limit=${limit}`);
    return data.matches.map((match) => ({
      id: match.id,
      roomCode: match.roomCode,
      playerCount: match.playerCount,
      finishedAt: match.finishedAt,
      points: match.points,
      seed: match.seed,
      round: match.round,
    }));
  }

  subscribeTable(code: string, subscription: TableSubscription): Unsubscribe {
    this.pollers.get(code)?.stop();
    const poller = new TablePoller(code, subscription, () => this.token(), (serverTime, rtt) => this.updateClock(serverTime, rtt));
    this.pollers.set(code, poller);
    poller.start();
    return () => {
      poller.stop();
      if (this.pollers.get(code) === poller) this.pollers.delete(code);
    };
  }
}

import { LONG_POLL } from '@/config/env';
import { DEFAULT_GAME, isGameId, readSelectedGame, saveSelectedGame, type GameId } from '@/config/games';
import type { ArrangementIds, Card, Pile, PlayerScore } from '@/game-logic';
import type { TienLenCard } from '@/game-logic/tienlen';
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
  type RoomChatMessage,
  type TablePlayer,
  type TableState,
  type TableSubscription,
  type TableSummary,
  type TienLenState,
  type TienLenScoringConfig,
  type Unsubscribe,
} from './types';

/** Khoảng poll (ms): 1s khi đang trong bàn; backoff 1s,2s,4s… tối đa 10s khi lỗi mạng. */
export const POLL_INTERVAL_MS = 1000;
export const MAX_BACKOFF_MS = 10_000;

const PHASES: readonly Phase[] = ['waiting', 'dealing', 'playing', 'arranging', 'revealing', 'scoring', 'summary', 'next'];

interface RawPlayer {
  id: string;
  name: string;
  submitted?: boolean;
  seat?: number;
  balance?: number;
  spectator?: boolean;
  left?: boolean;
  cardCount?: number;
}

interface RawRoom {
  code: string;
  gameType?: GameId;
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
  scoringMode?: 'points' | 'coins';
  targetScore?: number;
  scoringConfig?: TienLenScoringConfig;
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
  autoTopupAmount?: number;
  results: (Omit<RoundResults, 'players'> & { players: Partial<PlayerScore>[] }) | null;
  chatMessages?: RoomChatMessage[];
}

interface RawTienLenSnapshot extends TienLenState {
  serverTime?: number;
  version?: number;
  changed?: boolean;
  autoTopupAmount?: number;
  playerId: string;
  room: RawRoom & { deadline: number | null };
  chatMessages?: RoomChatMessage[];
}
type Snapshot = RawSnapshot | RawTienLenSnapshot;

const idOf = (item: Card | string): string => (typeof item === 'string' ? item : item.id);

function derivePhase(room: RawRoom): Phase {
  if (room.phase && PHASES.includes(room.phase)) return room.phase;
  if (room.cancelled || !room.started) return 'waiting';
  return room.finished ? 'summary' : 'arranging';
}

/** Chuẩn hóa JSON snapshot của API PHP (cả phòng cũ lẫn phòng autoPlay) thành TableState. */
export function normalizeSnapshot(raw: Snapshot, previousVersion = 0): TableState {
  if ('turn' in raw) {
    const room = raw.room;
    const players: TablePlayer[] = room.players.map((player, index) => ({
      id: player.id, name: player.name, seat: player.seat ?? index + 1,
      balance: player.balance ?? 0, submitted: false,
      spectator: Boolean(player.spectator), left: Boolean(player.left),
      cardCount: player.cardCount,
    }));
    return {
      code: room.code, gameType: 'tienlen', hostId: room.hostId, stake: room.stake,
      maxPlayers: room.maxPlayers ?? 4, hasPassword: Boolean(room.hasPassword), autoPlay: Boolean(room.autoPlay),
      phase: derivePhase(room), phaseStartedAt: room.phaseStartedAt ?? 0, phaseDeadline: room.deadline,
      round: room.round ?? 0, version: raw.version ?? previousVersion, players, selfId: raw.playerId,
      cards: [], arrangement: null, submitted: false,
      balance: players.find((player) => player.id === raw.playerId)?.balance ?? 0,
      results: null, cancelled: Boolean(room.cancelled), cancelMessage: room.cancelMessage,
      autoTopupAmount: raw.autoTopupAmount,
      chatMessages: raw.chatMessages ?? [],
      tienlen: {
        cards: raw.cards, turn: raw.turn, table: raw.table, lastPlayer: raw.lastPlayer,
        passed: raw.passed, ranking: raw.ranking, events: raw.events, required: raw.required,
        results: raw.results, chopRules: raw.chopRules, turnSeconds: raw.turnSeconds,
        scoringMode: room.scoringMode,
        targetScore: room.targetScore,
        scoringConfig: room.scoringConfig,
        matchTotals: raw.matchTotals,
        matchEnded: raw.matchEnded,
        matchPlayers: raw.matchPlayers,
      },
    };
  }
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
    gameType: room.gameType ?? DEFAULT_GAME,
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
    autoTopupAmount: raw.autoTopupAmount,
    results,
    cancelled: Boolean(room.cancelled),
    cancelMessage: room.cancelMessage,
    chatMessages: raw.chatMessages ?? [],
  };
}

class TablePoller {
  version: number | null = null;
  chatSinceId = 0;
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
    private readonly gameType: GameId,
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
  accept(raw: Snapshot): void {
    if (this.stopped) return;
    const next = normalizeSnapshot(raw, this.version ?? 0);
    const previousMessages = this.state?.chatMessages ?? [];
    if (raw.chatMessages) {
      const merged = new Map(previousMessages.map((message) => [message.id, message]));
      for (const message of raw.chatMessages) merged.set(message.id, message);
      next.chatMessages = [...merged.values()].slice(-50);
    } else {
      next.chatMessages = previousMessages;
    }
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
    query.set('game_type', this.gameType);
    if (this.version !== null) query.set('since_version', String(this.version));
    query.set('chat_since_id', String(this.chatSinceId));
    if (LONG_POLL && this.version !== null) query.set('wait', '1');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    try {
      const { data, serverTime, rtt } = await apiFetch<Snapshot>(`/rooms/${this.code}${suffix}`, {
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
      if (data.chatMessages?.length) {
        this.chatSinceId = Math.max(this.chatSinceId, ...data.chatMessages.map((message) => message.id));
      }
      this.accept(data);
      this.schedule(LONG_POLL ? 0 : POLL_INTERVAL_MS);
    } catch (error) {
      if (this.stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
      const status = error instanceof GatewayError ? error.status : 0;
      if (status === 403 || status === 404 || status === 401 || (status === 409 && this.gameType === 'tienlen')) {
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
  readonly capabilities = { chat: true, emoji: true };
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

  async currentTableCode(): Promise<string | null> {
    const data = await this.request<unknown>('/rooms/current');
    if (typeof data !== 'object' || data === null || !('code' in data)) {
      throw new GatewayError('Máy chủ trả mã bàn không hợp lệ.');
    }
    if (data.code === null) return null;
    if (typeof data.code !== 'string' || !/^[A-Z2-9]{5}$/.test(data.code)) {
      throw new GatewayError('Máy chủ trả mã bàn không hợp lệ.');
    }
    if ('gameType' in data && isGameId(data.gameType)) saveSelectedGame(data.gameType);
    return data.code;
  }

  async listTables(gameType: GameId = DEFAULT_GAME): Promise<TableSummary[]> {
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
        scoringMode?: 'points' | 'coins';
      }>;
    }>(`/rooms?game_type=${encodeURIComponent(gameType)}`);
    return data.rooms.map((room) => ({
      code: room.code,
      gameType,
      hostName: room.hostName,
      playerCount: room.playerCount,
      maxPlayers: room.maxPlayers ?? 4,
      stake: room.stake,
      hasPassword: Boolean(room.hasPassword),
      phase: room.phase ?? 'waiting',
      round: room.round ?? 0,
      scoringMode: room.scoringMode,
    }));
  }

  async createTable(options: CreateTableOptions): Promise<TableState> {
    const raw = await this.request<Snapshot>('/rooms', {
      method: 'POST',
      body: {
        game_type: options.gameType ?? DEFAULT_GAME,
        isPublic: options.isPublic,
        stake: options.stake,
        maxPlayers: options.maxPlayers,
        autoPlay: true,
        ...(options.scoringMode ? { scoringMode: options.scoringMode } : {}),
        ...(options.targetScore ? { targetScore: options.targetScore } : {}),
        ...(options.scoringConfig ? { scoringConfig: options.scoringConfig } : {}),
        ...(options.password ? { password: options.password } : {}),
      },
    });
    return normalizeSnapshot(raw);
  }

  async joinTable(code: string, password?: string, gameType: GameId = DEFAULT_GAME): Promise<TableState> {
    const raw = await this.request<Snapshot>('/rooms/join', {
      method: 'POST',
      body: { code, game_type: gameType, ...(password ? { password } : {}) },
    });
    return normalizeSnapshot(raw);
  }

  async quickPlay(stake?: number, gameType: GameId = DEFAULT_GAME): Promise<TableState> {
    const raw = await this.request<Snapshot>('/rooms/quick', {
      method: 'POST',
      body: { game_type: gameType, ...(stake ? { stake } : {}) },
    });
    return normalizeSnapshot(raw);
  }

  async leaveTable(code: string): Promise<void> {
    await this.request(`/rooms/${code}/leave`, { method: 'POST', body: {} });
  }

  async startRound(code: string): Promise<TableState> {
    const raw = await this.request<Snapshot>(`/rooms/${code}/start`, { method: 'POST', body: {} });
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

  async tienLenAction(code: string, action: { type: 'play'; cards: TienLenCard[] } | { type: 'pass' }): Promise<TableState> {
    const poller = this.pollers.get(code);
    if (poller) poller.pending++;
    try {
      const raw = await this.request<Snapshot>(`/rooms/${code}/action`, { method: 'POST', body: action });
      poller?.accept(raw);
      return normalizeSnapshot(raw);
    } finally {
      if (poller) poller.pending--;
    }
  }

  async sendChat(code: string, text: string): Promise<void> {
    await this.request(`/rooms/${code}/chat`, { method: 'POST', body: { text } });
  }

  async sendEmoji(code: string, emoji: string): Promise<void> {
    await this.sendChat(code, emoji);
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
    const gameType = readSelectedGame();
    const poller = new TablePoller(
      code,
      gameType,
      subscription,
      () => this.token(),
      (serverTime, rtt) => this.updateClock(serverTime, rtt),
    );
    this.pollers.set(code, poller);
    poller.start();
    return () => {
      poller.stop();
      if (this.pollers.get(code) === poller) this.pollers.delete(code);
    };
  }
}

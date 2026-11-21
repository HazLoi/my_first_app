import type { ArrangementIds, Card, PlayerScore } from '@/game-logic';
import type { GameId } from '@/config/games';
import type { ChopRules, Combo, TienLenCard } from '@/game-logic/tienlen';

export type Phase = 'waiting' | 'dealing' | 'playing' | 'arranging' | 'revealing' | 'scoring' | 'summary' | 'next';

export interface TienLenScoringConfig {
  rankPoints: Partial<Record<2 | 3 | 4, number[]>>;
  chopValues: Record<'black_two' | 'red_two' | 'four' | 'pairs_run_3' | 'pairs_run_4', number>;
  chopperGains: boolean;
  chopOverMode?: 'last-pays-all' | 'stack';
  coverShortfallByEarlierVictims?: boolean;
  whiteEnabled: boolean;
  bonusPerOpponent: number;
  whiteTypes: Record<'dragon' | 'four_twos' | 'six_pairs' | 'five_pairs_run' | 'four_threes', boolean>;
  coldEnabled: boolean;
  coldPenalty: number;
  rottenEnabled: boolean;
}

export interface RoomChatMessage {
  id: number;
  userId: string;
  displayName: string;
  text: string;
  createdAt: number;
}

export interface TienLenState {
  cards: TienLenCard[];
  turn: string | null;
  table: Combo | null;
  lastPlayer: string | null;
  passed: string[];
  ranking: string[];
  required: TienLenCard | null;
  chopRules: ChopRules;
  turnSeconds: number;
  events: Array<{ type: string; player?: string; from?: string; to?: string }>;
  results: { players: Array<{ id: string; name: string; place: number | null; matchPlace?: number | null; left?: boolean; chips: number; roundPoints?: number; matchPoints?: number; matchEnded?: boolean; matchTieIds?: string[]; autoTopupAmount?: number; details: { rank: number; chop: number; cold: number; rotten: number; white: number; round?: number } }>; chopChains?: Array<{ layers: Array<{ from: string; to: string; combo: Combo }>; units: number; mode: 'last-pays-all' | 'stack'; transfers: Array<{ from: string; to: string; amount: number; credited: boolean }> }> } | null;
  scoringMode?: 'points' | 'coins';
  targetScore?: number;
  scoringConfig?: TienLenScoringConfig;
  matchTotals?: Record<string, number>;
  matchEnded?: boolean;
  matchPlayers?: Array<{ id: string; name: string; left: boolean }>;
}

export type ConnectionStatus = 'online' | 'reconnecting' | 'offline';

export interface TablePlayer {
  id: string;
  name: string;
  /** Đã bấm Xong (chốt bài) trong ván hiện tại. */
  submitted: boolean;
  seat: number;
  /** Số xu hiển thị (trước thanh toán cho tới phase summary). */
  balance: number;
  /** Vào giữa ván: chờ ván sau. */
  spectator: boolean;
  /** Đã rời giữa ván (bài tự xếp). */
  left: boolean;
  isBot?: boolean;
  avatar?: number;
  level?: number;
  cardCount?: number;
}

export interface RoundResults {
  stake: number;
  round: number;
  seed?: string;
  players: PlayerScore[];
}

/** Trạng thái một bàn, chuẩn hóa từ API PHP hoặc MockGateway. */
export interface TableState {
  code: string;
  gameType?: GameId;
  hostId: string;
  stake: number;
  maxPlayers: number;
  hasPassword: boolean;
  autoPlay: boolean;
  phase: Phase;
  /** Thời điểm bắt đầu/kết thúc phase theo giờ server (ms). */
  phaseStartedAt: number;
  phaseDeadline: number | null;
  round: number;
  version: number;
  players: TablePlayer[];
  /** id người chơi của chính mình trong bàn. */
  selfId: string;
  /** Bài trên tay của mình (13 lá, rỗng nếu chưa chia / khán giả). */
  cards: Card[];
  arrangement: ArrangementIds | null;
  submitted: boolean;
  balance: number;
  autoTopupAmount?: number;
  results: RoundResults | null;
  cancelled: boolean;
  cancelMessage?: string;
  chatMessages?: RoomChatMessage[];
  tienlen?: TienLenState;
}

export interface TableSummary {
  code: string;
  gameType?: GameId;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  stake: number;
  hasPassword: boolean;
  phase: Phase;
  round: number;
  scoringMode?: 'points' | 'coins';
}

export interface CreateTableOptions {
  gameType?: GameId;
  stake: number;
  maxPlayers: 2 | 3 | 4;
  isPublic: boolean;
  password?: string;
  scoringMode?: 'points' | 'coins';
  targetScore?: number;
  scoringConfig?: TienLenScoringConfig;
}

export interface MatchHistoryEntry {
  id: string;
  roomCode: string;
  playerCount: number;
  finishedAt: string;
  points: number;
  seed?: string;
  round?: number;
}

export interface TableEvent {
  type: 'join' | 'leave' | 'kicked' | 'chat' | 'emoji';
  playerId?: string;
  name?: string;
  text?: string;
  at: number;
}

export interface TableSubscription {
  onState(state: TableState): void;
  onStatus?(status: ConnectionStatus): void;
  onEvent?(event: TableEvent): void;
  /** Gọi khi người chơi không còn ở bàn (bị loại, hết xu, bàn bị xóa). */
  onClosed?(reason: 'kicked' | 'gone' | 'cancelled', message?: string): void;
}

export type Unsubscribe = () => void;

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** Giao diện chung cho MockGateway (bot, dev UI) và PollingGateway (API PHP). */
export interface GameGateway {
  readonly kind: 'mock' | 'polling';
  readonly capabilities: { chat: boolean; emoji: boolean };

  listTables(gameType?: GameId): Promise<TableSummary[]>;
  /** Mã bàn tài khoản còn tham gia, hoặc null nếu không còn ở bàn nào. */
  currentTableCode(): Promise<string | null>;
  createTable(options: CreateTableOptions): Promise<TableState>;
  joinTable(code: string, password?: string, gameType?: GameId): Promise<TableState>;
  quickPlay(stake?: number, gameType?: GameId): Promise<TableState>;
  leaveTable(code: string): Promise<void>;
  /** Chủ bàn bấm Bắt đầu (WAITING → DEALING). */
  startRound(code: string): Promise<TableState>;
  /** Có optimistic update: state mới được đẩy qua subscription ngay, rollback nếu server từ chối. */
  submitArrangement(code: string, arrangement: ArrangementIds): Promise<TableState>;
  tienLenAction(code: string, action: { type: 'play'; cards: TienLenCard[] } | { type: 'pass' }): Promise<TableState>;
  sendChat(code: string, text: string): Promise<void>;
  sendEmoji(code: string, emoji: string): Promise<void>;
  history(limit?: number): Promise<MatchHistoryEntry[]>;
  subscribeTable(code: string, subscription: TableSubscription): Unsubscribe;
  /** Giờ server hiện tại (ms), đã hiệu chỉnh độ lệch đồng hồ. */
  serverNow(): number;
}

import type { ArrangementIds, Card, PlayerScore } from '@/game-logic';

export type Phase = 'waiting' | 'dealing' | 'arranging' | 'revealing' | 'scoring' | 'summary' | 'next';

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
  results: RoundResults | null;
  cancelled: boolean;
  cancelMessage?: string;
}

export interface TableSummary {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  stake: number;
  hasPassword: boolean;
  phase: Phase;
  round: number;
}

export interface CreateTableOptions {
  stake: number;
  maxPlayers: 2 | 3 | 4;
  isPublic: boolean;
  password?: string;
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

  listTables(): Promise<TableSummary[]>;
  createTable(options: CreateTableOptions): Promise<TableState>;
  joinTable(code: string, password?: string): Promise<TableState>;
  quickPlay(stake?: number): Promise<TableState>;
  leaveTable(code: string): Promise<void>;
  /** Chủ bàn bấm Bắt đầu (WAITING → DEALING). */
  startRound(code: string): Promise<TableState>;
  /** Có optimistic update: state mới được đẩy qua subscription ngay, rollback nếu server từ chối. */
  submitArrangement(code: string, arrangement: ArrangementIds): Promise<TableState>;
  sendChat(code: string, text: string): Promise<void>;
  sendEmoji(code: string, emoji: string): Promise<void>;
  history(limit?: number): Promise<MatchHistoryEntry[]>;
  subscribeTable(code: string, subscription: TableSubscription): Unsubscribe;
  /** Giờ server hiện tại (ms), đã hiệu chỉnh độ lệch đồng hồ. */
  serverNow(): number;
}

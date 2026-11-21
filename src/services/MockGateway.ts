import { MIN_BALANCE_MULTIPLIER, RULES, STAKES } from '@/config/rules';
import {
  arrangementToHands,
  autoArrange,
  botArrange,
  compareResults,
  dealHands,
  isValidArrangement,
  mulberry32,
  newSeed,
  settleChips,
  shuffleWithSeed,
  type ArrangementIds,
  type BotLevel,
  type Card,
  type PlayerScore,
} from '@/game-logic';
import { mockUserByToken, updateMockBalance } from './mockAuth';
import { readSession } from './sessionStore';
import {
  GatewayError,
  type CreateTableOptions,
  type GameGateway,
  type MatchHistoryEntry,
  type Phase,
  type RoundResults,
  type TableEvent,
  type TablePlayer,
  type TableState,
  type TableSubscription,
  type TableSummary,
  type Unsubscribe,
} from './types';

const BOT_NAMES = [
  'Minh Anh', 'Bảo Ngọc', 'Hoàng Long', 'Thu Hà', 'Quốc Khánh', 'Mai Linh', 'Đức Thịnh', 'Lan Phương',
  'Tuấn Kiệt', 'Ngọc Trâm', 'Gia Huy', 'Khánh Vy', 'Thanh Tùng', 'Diệu Linh', 'Việt Hoàng', 'Phương Thảo',
];
const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard', 'medium'];
const BOT_CHATS = ['Chào cả nhà!', 'Ván này căng đây 😎', 'Gà quá đi…', 'Hên xui thôi mà!', 'Chơi tiếp nào'];
const BOT_EMOJIS = ['😂', '😎', '😭', '👍', '🔥'];
const HISTORY_KEY = 'zp_mock_history';

interface MockPlayer {
  id: string;
  name: string;
  isBot: boolean;
  level: BotLevel;
  avatar: number;
  seat: number;
  balance: number;
  /** Số dư trước khi thanh toán ván hiện tại (hiển thị ở revealing/scoring). */
  preBalance: number;
  hand: Card[];
  arrangement: ArrangementIds | null;
  spectator: boolean;
  userLevel: number;
}

type NewPlayer = Pick<MockPlayer, 'id' | 'name' | 'isBot' | 'level' | 'avatar' | 'balance' | 'userLevel'>;

const rnd = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
const minBalance = (stake: number): number => stake * MIN_BALANCE_MULTIPLIER;
const toMs = (seconds: number): number => seconds * 1000;

function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

interface TableOptions {
  code?: string;
  stake: number;
  maxPlayers: number;
  password?: string;
  isPublic: boolean;
}

class MockTable {
  readonly code: string;
  readonly stake: number;
  readonly maxPlayers: number;
  readonly password: string | undefined;
  readonly isPublic: boolean;
  players: MockPlayer[] = [];
  hostId = '';
  phase: Phase = 'waiting';
  phaseStartedAt = Date.now();
  phaseDeadline: number | null = null;
  round = 0;
  version = 1;
  seed = '';
  results: RoundResults | null = null;
  listeners = new Set<TableSubscription>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private botTimers: ReturnType<typeof setTimeout>[] = [];
  private fillTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private rng = mulberry32(Date.now() & 0xffffff);

  constructor(
    options: TableOptions,
    private readonly onChipsChanged: (player: MockPlayer) => void,
    private readonly onRoundSaved: (entry: MatchHistoryEntry) => void,
  ) {
    this.code = options.code ?? makeCode();
    this.stake = options.stake;
    this.maxPlayers = options.maxPlayers;
    this.password = options.password || undefined;
    this.isPublic = options.isPublic;
  }

  get humans(): MockPlayer[] {
    return this.players.filter((player) => !player.isBot);
  }

  addPlayer(player: NewPlayer): MockPlayer {
    const used = new Set(this.players.map((p) => p.seat));
    let seat = 1;
    while (used.has(seat)) seat++;
    const added: MockPlayer = {
      ...player,
      seat,
      preBalance: player.balance,
      hand: [],
      arrangement: null,
      spectator: this.phase !== 'waiting',
    };
    this.players.push(added);
    if (!this.hostId) this.hostId = added.id;
    this.touch();
    return added;
  }

  addBot(): MockPlayer | null {
    if (this.players.length >= this.maxPlayers) return null;
    const taken = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5)[0] ?? `Bot ${rnd(10, 99)}`;
    const bot = this.addPlayer({
      id: `bot-${crypto.randomUUID().slice(0, 8)}`,
      name,
      isBot: true,
      level: BOT_LEVELS[this.players.length % BOT_LEVELS.length] as BotLevel,
      avatar: rnd(0, 11),
      balance: rnd(4, 20) * 1000,
      userLevel: rnd(1, 30),
    });
    this.evaluateStartConditions();
    return bot;
  }

  /** Bot lần lượt vào bàn cho tới khi đủ người. */
  fillWithBots(): void {
    if (this.fillTimer) clearTimeout(this.fillTimer);
    const step = (): void => {
      if (this.disposed || this.players.length >= this.maxPlayers) return;
      this.addBot();
      if (this.players.length < this.maxPlayers) this.fillTimer = setTimeout(step, rnd(1200, 2600));
    };
    this.fillTimer = setTimeout(step, rnd(900, 1800));
  }

  private emitEvent(event: TableEvent): void {
    for (const listener of this.listeners) listener.onEvent?.(event);
  }

  touch(): void {
    this.version++;
    this.emit();
  }

  snapshotFor(playerId: string): TableState {
    const me = this.players.find((p) => p.id === playerId) as MockPlayer;
    const hidePayout = this.phase === 'revealing' || this.phase === 'scoring';
    const shown = (p: MockPlayer): number => (hidePayout ? p.preBalance : p.balance);
    const players: TablePlayer[] = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      submitted: p.arrangement !== null && !p.spectator,
      seat: p.seat,
      balance: shown(p),
      spectator: p.spectator,
      left: false,
      isBot: p.isBot,
      avatar: p.avatar,
      level: p.userLevel,
    }));
    const showResults = ['revealing', 'scoring', 'summary', 'next'].includes(this.phase);
    return {
      code: this.code,
      hostId: this.hostId,
      stake: this.stake,
      maxPlayers: this.maxPlayers,
      hasPassword: Boolean(this.password),
      autoPlay: true,
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      phaseDeadline: this.phaseDeadline,
      round: this.round,
      version: this.version,
      players,
      selfId: playerId,
      cards: me.spectator || this.phase === 'waiting' ? [] : me.hand,
      arrangement: me.arrangement,
      submitted: me.arrangement !== null && !me.spectator,
      balance: shown(me),
      results: showResults ? this.results : null,
      cancelled: false,
    };
  }

  emit(): void {
    const human = this.humans[0];
    if (!human) return;
    for (const listener of this.listeners) listener.onState(this.snapshotFor(human.id));
  }

  // ---- máy trạng thái (cùng quy ước phase với server PHP) ----

  private setPhase(phase: Phase, seconds: number | null): void {
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.phaseDeadline = seconds === null ? null : this.phaseStartedAt + toMs(seconds);
    this.touch();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || this.phaseDeadline === null) return;
    this.timer = setTimeout(() => this.advance(), Math.max(0, this.phaseDeadline - Date.now()));
  }

  evaluateStartConditions(): void {
    if (this.phase !== 'waiting') return;
    if (this.players.length >= this.maxPlayers && this.phaseDeadline === null) {
      this.phaseDeadline = Date.now() + toMs(RULES.autoStartDelaySeconds);
      this.touch();
      this.schedule();
    } else if (this.players.length < this.maxPlayers && this.phaseDeadline !== null) {
      this.phaseDeadline = null;
      this.touch();
      this.schedule();
    }
  }

  startRoundNow(): void {
    if (this.phase === 'waiting') this.startRound();
  }

  private startRound(): void {
    if (this.fillTimer) clearTimeout(this.fillTimer);
    // Người hết xu bị đưa ra; bot được nạp lại để ván tiếp tục.
    for (const player of [...this.players]) {
      if (player.balance >= minBalance(this.stake)) continue;
      if (player.isBot) {
        player.balance = rnd(6, 18) * 1000;
        continue;
      }
      this.removePlayer(player.id, 'kicked', `Bạn không đủ ${minBalance(this.stake)} xu cho mức cược ${this.stake}. Đã đưa về sảnh.`);
    }
    if (this.disposed || this.humans.length === 0) return;
    if (this.players.length < 2) {
      this.setPhase('waiting', null);
      this.fillWithBots();
      return;
    }
    this.round++;
    this.seed = newSeed();
    const hands = dealHands(shuffleWithSeed(this.seed), this.players.length);
    this.players.forEach((player, index) => {
      player.hand = hands[index] as Card[];
      player.arrangement = null;
      player.spectator = false;
      player.preBalance = player.balance;
    });
    this.results = null;
    this.setPhase('dealing', RULES.phaseSeconds.dealing);
  }

  private scheduleBots(): void {
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
    for (const bot of this.players.filter((p) => p.isBot && !p.spectator)) {
      this.botTimers.push(
        setTimeout(() => {
          if (this.disposed || this.phase !== 'arranging' || bot.arrangement) return;
          bot.arrangement = botArrange(bot.hand, bot.level, this.rng);
          this.touch();
          this.checkAllSubmitted();
        }, rnd(3000, 10_000)),
      );
    }
  }

  private checkAllSubmitted(): void {
    const active = this.players.filter((p) => !p.spectator);
    if (this.phase === 'arranging' && active.length > 0 && active.every((p) => p.arrangement)) this.beginReveal();
  }

  submit(playerId: string, arrangement: ArrangementIds): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.spectator) throw new GatewayError('Bạn đang xem ván này.', 409);
    if (this.phase !== 'arranging') throw new GatewayError('Hiện không có ván bài đang diễn ra.', 409);
    if (player.arrangement) throw new GatewayError('Bạn đã chốt bài rồi.', 409);
    const check = isValidArrangement(player.hand, arrangement);
    if (!check.valid) throw new GatewayError(check.message ?? 'Bài xếp không hợp lệ.', 400);
    player.arrangement = arrangement;
    this.touch();
    this.checkAllSubmitted();
  }

  private beginReveal(): void {
    this.botTimers.forEach(clearTimeout);
    const active = this.players.filter((p) => !p.spectator);
    for (const player of active) player.arrangement ??= autoArrange(player.hand).arrangement;
    const scored = compareResults(
      active.map((p) => ({ id: p.id, name: p.name, hands: arrangementToHands(p.hand, p.arrangement as ArrangementIds) })),
    );
    const balances = Object.fromEntries(active.map((p) => [p.id, p.balance]));
    const deltas = Object.fromEntries(scored.map((s) => [s.id, s.points * this.stake]));
    const settled = settleChips(deltas, balances);
    const players: PlayerScore[] = scored.map((score) => {
      const player = active.find((p) => p.id === score.id) as MockPlayer;
      const chips = settled[score.id] ?? 0;
      player.preBalance = player.balance;
      player.balance += chips;
      return { ...score, chips, balanceBefore: player.preBalance, balanceAfter: player.balance };
    });
    this.results = { stake: this.stake, round: this.round, seed: this.seed, players };
    for (const player of this.humans) this.onChipsChanged(player);
    const mine = players.find((p) => active.find((a) => a.id === p.id && !a.isBot));
    if (mine) {
      this.onRoundSaved({
        id: `${this.code}-${this.round}`,
        roomCode: this.code,
        playerCount: active.length,
        finishedAt: new Date().toISOString(),
        points: mine.points,
        seed: this.seed,
        round: this.round,
      });
    }
    this.setPhase('revealing', RULES.phaseSeconds.revealing);
  }

  advance(): void {
    if (this.disposed) return;
    switch (this.phase) {
      case 'waiting':
        if (this.players.length >= 2) this.startRound();
        break;
      case 'dealing':
        this.setPhase('arranging', RULES.phaseSeconds.arranging);
        this.scheduleBots();
        break;
      case 'arranging':
        this.beginReveal();
        break;
      case 'revealing':
        this.setPhase('scoring', RULES.phaseSeconds.scoring);
        break;
      case 'scoring':
        this.setPhase('summary', RULES.phaseSeconds.summary);
        this.botReactions();
        break;
      case 'summary':
        this.setPhase('next', RULES.phaseSeconds.next);
        break;
      case 'next':
        this.startRound();
        break;
    }
  }

  private botReactions(): void {
    for (const bot of this.players.filter((p) => p.isBot)) {
      if (Math.random() > 0.35) continue;
      const emoji = Math.random() < 0.6;
      setTimeout(() => {
        if (this.disposed) return;
        this.emitEvent({
          type: emoji ? 'emoji' : 'chat',
          playerId: bot.id,
          name: bot.name,
          text: emoji ? pick(BOT_EMOJIS) : pick(BOT_CHATS),
          at: Date.now(),
        });
      }, rnd(300, 1800));
    }
  }

  chat(playerId: string, text: string, emoji: boolean): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    this.emitEvent({ type: emoji ? 'emoji' : 'chat', playerId, name: player.name, text, at: Date.now() });
    const bot = this.players.find((p) => p.isBot);
    if (!emoji && bot && Math.random() < 0.5) {
      setTimeout(
        () => this.emitEvent({ type: 'chat', playerId: bot.id, name: bot.name, text: pick(BOT_CHATS), at: Date.now() }),
        rnd(600, 1600),
      );
    }
  }

  removePlayer(playerId: string, reason: 'left' | 'kicked', message?: string): void {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index < 0) return;
    const [player] = this.players.splice(index, 1) as [MockPlayer];
    if (!player.isBot) {
      for (const listener of this.listeners) listener.onClosed?.(reason === 'kicked' ? 'kicked' : 'gone', message);
    }
    if (this.hostId === playerId) this.hostId = (this.players.find((p) => !p.isBot) ?? this.players[0])?.id ?? '';
    if (this.humans.length === 0) {
      this.dispose();
      return;
    }
    if (this.phase === 'arranging') this.checkAllSubmitted();
    else if (this.phase === 'waiting') this.evaluateStartConditions();
    this.touch();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.fillTimer) clearTimeout(this.fillTimer);
    this.botTimers.forEach(clearTimeout);
  }
}

const SAMPLE_TABLES: { host: string; stake: number; players: number; max: number; locked?: boolean; playing?: boolean }[] = [
  { host: 'Minh Anh', stake: 50, players: 2, max: 4 },
  { host: 'Bảo Ngọc', stake: 50, players: 1, max: 2 },
  { host: 'Hoàng Long', stake: 100, players: 3, max: 4, playing: true },
  { host: 'Thu Hà', stake: 100, players: 2, max: 3 },
  { host: 'Quốc Khánh', stake: 200, players: 4, max: 4, playing: true },
  { host: 'Mai Linh', stake: 200, players: 1, max: 4, locked: true },
  { host: 'Đức Thịnh', stake: 500, players: 2, max: 4 },
  { host: 'Lan Phương', stake: 500, players: 3, max: 3, playing: true },
  { host: 'Tuấn Kiệt', stake: 1000, players: 1, max: 4 },
  { host: 'Ngọc Trâm', stake: 1000, players: 2, max: 2 },
];

/** Gateway chạy cục bộ: bot + máy trạng thái trong trình duyệt, dùng để dev giao diện. */
export class MockGateway implements GameGateway {
  readonly kind = 'mock' as const;
  readonly capabilities = { chat: true, emoji: true };
  private tables = new Map<string, MockTable>();
  private humanTable = new Map<string, string>();
  private samples = SAMPLE_TABLES.map((sample, index) => ({
    ...sample,
    code: `S${index + 2}${'ABCDEFGH'[index % 8]}${index + 3}K`,
  }));

  private me(): { token: string; id: string; name: string; balance: number; avatar: number; level: number } {
    const session = readSession();
    const user = session ? mockUserByToken(session.token) : null;
    if (!session || !user) throw new GatewayError('Vui lòng đăng nhập lại.', 401);
    return {
      token: session.token,
      id: user.id,
      name: user.displayName,
      balance: user.balance,
      avatar: user.avatar ?? 0,
      level: user.level ?? 1,
    };
  }

  private createTableObject(options: TableOptions): MockTable {
    const table = new MockTable(
      options,
      (player) => {
        const session = readSession();
        if (session) updateMockBalance(session.token, player.balance);
      },
      (entry) => this.saveHistory(entry),
    );
    this.tables.set(table.code, table);
    return table;
  }

  private seat(table: MockTable): TableState {
    const user = this.me();
    this.leaveCurrent(user.id);
    if (user.balance < minBalance(table.stake)) {
      throw new GatewayError(`Cần tối thiểu ${minBalance(table.stake)} xu để chơi mức cược ${table.stake} xu/điểm.`, 409);
    }
    if (table.players.length >= table.maxPlayers) throw new GatewayError('Phòng đã đủ người chơi.', 409);
    table.addPlayer({
      id: user.id,
      name: user.name,
      isBot: false,
      level: 'medium',
      avatar: user.avatar,
      balance: user.balance,
      userLevel: user.level,
    });
    this.humanTable.set(user.id, table.code);
    table.fillWithBots();
    return table.snapshotFor(user.id);
  }

  private leaveCurrent(userId: string): void {
    const code = this.humanTable.get(userId);
    if (!code) return;
    this.tables.get(code)?.removePlayer(userId, 'left');
    this.tables.delete(code);
    this.humanTable.delete(userId);
  }

  async listTables(): Promise<TableSummary[]> {
    const live = [...this.tables.values()]
      .filter((table) => table.isPublic)
      .map((table): TableSummary => ({
        code: table.code,
        hostName: table.players.find((p) => p.id === table.hostId)?.name ?? '—',
        playerCount: table.players.length,
        maxPlayers: table.maxPlayers,
        stake: table.stake,
        hasPassword: Boolean(table.password),
        phase: table.phase,
        round: table.round,
      }));
    const samples = this.samples
      .filter((sample) => !this.tables.has(sample.code))
      .map((sample): TableSummary => ({
        code: sample.code,
        hostName: sample.host,
        playerCount: sample.players,
        maxPlayers: sample.max,
        stake: sample.stake,
        hasPassword: Boolean(sample.locked),
        phase: sample.playing ? 'arranging' : 'waiting',
        round: sample.playing ? 3 : 0,
      }));
    return [...live, ...samples];
  }

  async createTable(options: CreateTableOptions): Promise<TableState> {
    const user = this.me();
    if (!(STAKES as readonly number[]).includes(options.stake)) throw new GatewayError('Mức cược không hợp lệ.', 400);
    this.leaveCurrent(user.id);
    return this.seat(this.createTableObject({ ...options }));
  }

  async joinTable(code: string, password?: string): Promise<TableState> {
    const normalized = code.trim().toUpperCase();
    let table = this.tables.get(normalized);
    if (!table) {
      const sample = this.samples.find((s) => s.code === normalized);
      if (!sample) throw new GatewayError('Không tìm thấy phòng với mã này.', 404);
      table = this.createTableObject({
        code: sample.code,
        stake: sample.stake,
        maxPlayers: sample.max,
        isPublic: true,
        password: sample.locked ? '1234' : undefined,
      });
      for (let i = 0; i < Math.min(sample.players, sample.max - 1); i++) table.addBot();
      table.hostId = table.players[0]?.id ?? '';
    }
    if (table.password && table.password !== password) throw new GatewayError('Sai mật khẩu bàn.', 403);
    return this.seat(table);
  }

  async quickPlay(stake?: number): Promise<TableState> {
    const user = this.me();
    const wanted = stake ?? [...STAKES].reverse().find((s) => user.balance >= minBalance(s)) ?? STAKES[0];
    const candidate = [...this.tables.values()].find(
      (table) => table.isPublic && !table.password && table.stake === wanted && table.players.length < table.maxPlayers,
    );
    if (candidate) return this.seat(candidate);
    return this.createTable({ stake: wanted, maxPlayers: 4, isPublic: true });
  }

  async leaveTable(code: string): Promise<void> {
    const user = this.me();
    const table = this.tables.get(code);
    table?.removePlayer(user.id, 'left');
    if (table && table.humans.length === 0) this.tables.delete(code);
    this.humanTable.delete(user.id);
  }

  private tableOf(code: string): MockTable {
    const table = this.tables.get(code);
    if (!table) throw new GatewayError('Không tìm thấy phòng với mã này.', 404);
    return table;
  }

  async startRound(code: string): Promise<TableState> {
    const user = this.me();
    const table = this.tableOf(code);
    if (table.hostId !== user.id) throw new GatewayError('Chỉ chủ phòng mới có thể chia bài.', 403);
    if (table.phase !== 'waiting') throw new GatewayError('Ván này đã bắt đầu.', 409);
    if (table.players.length < 2) throw new GatewayError('Cần ít nhất 2 người để bắt đầu.', 409);
    table.startRoundNow();
    return table.snapshotFor(user.id);
  }

  async submitArrangement(code: string, arrangement: ArrangementIds): Promise<TableState> {
    const user = this.me();
    const table = this.tableOf(code);
    table.submit(user.id, arrangement);
    return table.snapshotFor(user.id);
  }

  async sendChat(code: string, text: string): Promise<void> {
    this.tableOf(code).chat(this.me().id, text.slice(0, 80), false);
  }

  async sendEmoji(code: string, emoji: string): Promise<void> {
    this.tableOf(code).chat(this.me().id, emoji, true);
  }

  async history(limit = 20): Promise<MatchHistoryEntry[]> {
    return this.readHistory().slice(0, limit);
  }

  private readHistory(): MatchHistoryEntry[] {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as MatchHistoryEntry[];
    } catch {
      return [];
    }
  }

  private saveHistory(entry: MatchHistoryEntry): void {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...this.readHistory()].slice(0, 30)));
  }

  subscribeTable(code: string, subscription: TableSubscription): Unsubscribe {
    const user = this.me();
    const table = this.tables.get(code);
    if (!table || !table.players.some((p) => p.id === user.id)) {
      queueMicrotask(() => subscription.onClosed?.('gone', 'Bàn không còn tồn tại.'));
      return () => undefined;
    }
    table.listeners.add(subscription);
    subscription.onStatus?.('online');
    queueMicrotask(() => subscription.onState(table.snapshotFor(user.id)));
    return () => {
      table.listeners.delete(subscription);
    };
  }

  serverNow(): number {
    return Date.now();
  }
}

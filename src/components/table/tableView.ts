import { arrangementToHands, PILES, type ArrangementIds, type Card, type ChiOutcome, type Hands, type Pile } from '@/game-logic';
import type { Phase, RoundResults, TablePlayer } from '@/services/types';
import {
  CARD_REST_Y,
  DECK_POSITION,
  cardRowPosition,
  handIndex,
  handPosition,
  SLOT_CONFIG,
  type SlotName,
} from './layout';

export const PILE_NUMBER: Record<Pile, number> = { front: 1, middle: 2, back: 3 };

/** Thời gian lật chi đầu tiên sau khi vào phase revealing (giây), phần còn lại chia đều 3 chi. */
export const REVEAL_LEAD = 0.6;

/** Chi đang hiện (0..3) theo thời gian trôi qua từ đầu phase revealing. */
export function revealStageAt(elapsedSeconds: number, totalSeconds: number): number {
  if (elapsedSeconds < REVEAL_LEAD) return 0;
  const per = Math.max(0.5, (totalSeconds - REVEAL_LEAD) / 3);
  return Math.min(3, Math.floor((elapsedSeconds - REVEAL_LEAD) / per) + 1);
}

/** Số giây tới lần đổi chi tiếp theo; null nếu đã hiện hết. */
export function nextRevealChange(elapsedSeconds: number, totalSeconds: number): number | null {
  const stage = revealStageAt(elapsedSeconds, totalSeconds);
  if (stage >= 3) return null;
  const per = Math.max(0.5, (totalSeconds - REVEAL_LEAD) / 3);
  return REVEAL_LEAD + stage * per - elapsedSeconds;
}

export interface CardSpec {
  key: string;
  playerId: string;
  slot: SlotName;
  /** Lá bài thật (chỉ có khi được phép biết); null = chỉ thấy lưng. */
  card: Card | null;
  faceUp: boolean;
  hidden: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Trễ (giây) tính từ lúc target đổi, thời lượng tween, độ nảy lên khi bay. */
  delay: number;
  duration: number;
  arc: number;
  /** Tư thế xuất phát khi lá mới xuất hiện giữa phase (ví dụ chia bài từ giữa bàn). */
  from?: { x: number; y: number; z: number; scale: number };
}

export interface RowMark {
  key: string;
  playerId: string;
  slot: SlotName;
  pile: Pile;
  outcome: ChiOutcome;
}

export interface SpecInput {
  phase: Phase;
  round: number;
  /** Số giây đã trôi qua từ phaseStartedAt (giờ server). */
  elapsed: number;
  players: readonly TablePlayer[];
  slotOf: Readonly<Record<string, SlotName>>;
  selfId: string;
  cards: readonly Card[];
  arrangement: ArrangementIds | null;
  results: RoundResults | null;
  stage: number;
}

export interface TableCards {
  specs: CardSpec[];
  rowMarks: RowMark[];
}

const DEAL_STAGGER = 0.06;
const DEAL_PLAYER_STAGGER = 0.12;
const DEAL_DURATION = 0.45;

/** Danh sách người được chia bài trong ván (không tính khán giả). */
export function participants(input: Pick<SpecInput, 'players' | 'results' | 'phase'>): string[] {
  if (input.results && ['revealing', 'scoring', 'summary', 'next'].includes(input.phase)) {
    return input.results.players.map((player) => player.id).filter((id) => input.players.some((p) => p.id === id));
  }
  return input.players.filter((player) => !player.spectator).map((player) => player.id);
}

function handsFor(input: SpecInput, playerId: string): Hands | null {
  const scored = input.results?.players.find((player) => player.id === playerId);
  if (scored) return scored.hands;
  if (playerId === input.selfId && input.arrangement && input.cards.length === 13) {
    try {
      return arrangementToHands(input.cards, input.arrangement);
    } catch {
      return null;
    }
  }
  return null;
}

/** Tạo danh sách lá bài (13 lá/người) với đích đến theo phase — dùng chung cho 3D và 2D phẳng. */
export function buildCardSpecs(input: SpecInput): TableCards {
  const specs: CardSpec[] = [];
  const rowMarks: RowMark[] = [];
  const { phase, elapsed, selfId } = input;
  if (phase === 'waiting') return { specs, rowMarks };

  const ids = participants(input);
  const anyWhite = Boolean(input.results?.players.some((player) => player.white));
  const reveal = phase === 'revealing' || phase === 'scoring' || phase === 'summary';
  const stage = phase === 'revealing' ? (anyWhite ? 3 : input.stage) : reveal || phase === 'next' ? 3 : 0;

  ids.forEach((playerId, playerIndex) => {
    const slot = input.slotOf[playerId];
    if (!slot) return;
    const isSelf = playerId === selfId;
    const hands = handsFor(input, playerId);
    const flat: (Card | null)[] = Array.from({ length: 13 }, () => null);

    if (hands && (reveal || phase === 'next')) {
      for (const pile of PILES) hands[pile].forEach((card, index) => (flat[handIndex(pile, index)] = card));
    } else if (isSelf) {
      input.cards.slice(0, 13).forEach((card, index) => (flat[index] = card));
    }

    for (let k = 0; k < 13; k++) {
      const pile: Pile = k < 3 ? 'front' : k < 8 ? 'middle' : 'back';
      const index = k - (pile === 'front' ? 0 : pile === 'middle' ? 3 : 8);
      const key = `${input.round}:${playerId}:${k}`;
      const base = {
        key,
        playerId,
        slot,
        card: flat[k] ?? null,
        yaw: 0,
        arc: 0.4,
        hidden: false,
      };

      if (phase === 'dealing' || phase === 'arranging') {
        const hand = handPosition(slot, k, isSelf);
        const nominal = playerIndex * DEAL_PLAYER_STAGGER + k * DEAL_STAGGER;
        const dealing = phase === 'dealing';
        const fresh = dealing && elapsed < nominal + DEAL_DURATION;
        specs.push({
          ...base,
          card: isSelf ? flat[k] ?? null : null,
          faceUp: isSelf && dealing,
          hidden: isSelf && phase === 'arranging',
          x: hand.x,
          y: hand.y,
          z: hand.z,
          yaw: hand.yaw,
          scale: hand.scale,
          delay: Math.max(0, nominal - elapsed),
          duration: DEAL_DURATION,
          arc: 0.9,
          from: dealing && fresh ? { x: DECK_POSITION.x, y: CARD_REST_Y + k * 0.01, z: DECK_POSITION.z, scale: 0.9 } : undefined,
        });
        continue;
      }

      if (phase === 'next') {
        specs.push({
          ...base,
          faceUp: false,
          x: DECK_POSITION.x,
          y: CARD_REST_Y + (playerIndex * 13 + k) * 0.01,
          z: DECK_POSITION.z,
          scale: 0.9,
          delay: playerIndex * 0.05 + k * 0.025,
          duration: 0.55,
          arc: 0.7,
        });
        continue;
      }

      // revealing / scoring / summary: bài trải thành 3 hàng tại chỗ ngồi
      const config = SLOT_CONFIG[slot];
      const position = cardRowPosition(slot, pile, index);
      const faceUp = hands !== null && stage >= PILE_NUMBER[pile];
      specs.push({
        ...base,
        faceUp,
        hidden: hands === null,
        x: position.x,
        y: CARD_REST_Y,
        z: position.z,
        scale: config.scale,
        delay: faceUp ? index * 0.08 : k * 0.03,
        duration: 0.5,
        arc: faceUp ? 0.55 : 0.3,
      });
    }

    if (reveal && hands) {
      const scored = input.results?.players.find((player) => player.id === playerId);
      if (scored) {
        for (const pile of PILES) {
          if (stage >= PILE_NUMBER[pile]) {
            rowMarks.push({ key: `${input.round}:${playerId}:${pile}`, playerId, slot, pile, outcome: scored.chi[pile].outcome });
          }
        }
      }
    }
  });

  return { specs, rowMarks };
}

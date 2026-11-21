import {
  evaluateHand,
  isBinhLung,
  compareHands,
  PILES,
  PILE_SIZES,
  type ArrangementIds,
  type Card,
  type Hands,
  type Pile,
} from '@/game-logic';

export type SlotRef = { zone: Pile; index: number } | { zone: 'tray'; index: number };

/** Trạng thái xếp bài của người chơi: 3 chi (ô có thể trống) + khay bài chưa xếp (có thứ tự). */
export interface ArrangeState {
  front: (string | null)[];
  middle: (string | null)[];
  back: (string | null)[];
  tray: string[];
}

const SUIT_RANK: Record<string, number> = { '♠': 0, '♣': 1, '♦': 2, '♥': 3 };

/** Sắp theo giá trị giảm dần, cùng giá trị thì theo chất. */
export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => b.value - a.value || (SUIT_RANK[a.suit] ?? 0) - (SUIT_RANK[b.suit] ?? 0));
}

const emptyPile = (pile: Pile): (string | null)[] => Array.from({ length: PILE_SIZES[pile] }, () => null);

/** Tất cả 13 lá nằm trong khay (đã sắp theo rank). */
export function initialState(cards: readonly Card[]): ArrangeState {
  return {
    front: emptyPile('front'),
    middle: emptyPile('middle'),
    back: emptyPile('back'),
    tray: sortCards(cards).map((card) => card.id),
  };
}

/** Dựng lại từ bài đã xếp (server gửi hoặc gợi ý); lá không có trong `arrangement` về khay. */
export function fromArrangement(cards: readonly Card[], arrangement: ArrangementIds): ArrangeState {
  const placed = new Set<string>();
  const slots = (pile: Pile): (string | null)[] =>
    Array.from({ length: PILE_SIZES[pile] }, (_, index) => {
      const id = arrangement[pile][index];
      if (id === undefined || placed.has(id) || !cards.some((card) => card.id === id)) return null;
      placed.add(id);
      return id;
    });
  const front = slots('front');
  const middle = slots('middle');
  const back = slots('back');
  return { front, middle, back, tray: sortCards(cards.filter((card) => !placed.has(card.id))).map((card) => card.id) };
}

/** Xếp thẳng theo rank: 5 lá cao nhất vào chi 3, 5 tiếp theo vào chi 2, 3 lá còn lại vào chi 1. */
export function rankArrangement(cards: readonly Card[]): ArrangeState {
  const sorted = sortCards(cards).map((card) => card.id);
  return {
    back: sorted.slice(0, 5),
    middle: sorted.slice(5, 10),
    front: sorted.slice(10, 13),
    tray: [],
  };
}

export function locate(state: ArrangeState, id: string): SlotRef | null {
  for (const pile of PILES) {
    const index = state[pile].indexOf(id);
    if (index >= 0) return { zone: pile, index };
  }
  const index = state.tray.indexOf(id);
  return index >= 0 ? { zone: 'tray', index } : null;
}

export const cardAt = (state: ArrangeState, ref: SlotRef): string | null =>
  ref.zone === 'tray' ? (state.tray[ref.index] ?? null) : (state[ref.zone][ref.index] ?? null);

function clone(state: ArrangeState): ArrangeState {
  return { front: [...state.front], middle: [...state.middle], back: [...state.back], tray: [...state.tray] };
}

/**
 * Chuyển một lá tới ô đích. Ô đích có bài → hoán đổi (bài đó về chỗ cũ của lá được kéo).
 * Đích là khay → chèn vào khay tại `index` (kẹp trong phạm vi).
 */
export function moveCard(state: ArrangeState, id: string, target: SlotRef): ArrangeState {
  const source = locate(state, id);
  if (!source) return state;
  if (source.zone === target.zone && source.index === target.index) return state;
  const next = clone(state);

  if (target.zone === 'tray') {
    if (source.zone === 'tray') {
      next.tray.splice(source.index, 1);
      next.tray.splice(Math.max(0, Math.min(target.index, next.tray.length)), 0, id);
      return next;
    }
    next[source.zone][source.index] = null;
    next.tray.splice(Math.max(0, Math.min(target.index, next.tray.length)), 0, id);
    return next;
  }

  const occupant = next[target.zone][target.index] ?? null;
  next[target.zone][target.index] = id;
  if (source.zone === 'tray') {
    if (occupant === null) next.tray.splice(source.index, 1);
    else next.tray[source.index] = occupant;
  } else {
    next[source.zone][source.index] = occupant;
  }
  return next;
}

/** Hoán đổi vị trí hai lá bất kỳ (chạm chọn lá này rồi chạm lá kia). */
export function swapCards(state: ArrangeState, a: string, b: string): ArrangeState {
  const from = locate(state, a);
  const to = locate(state, b);
  if (!from || !to || a === b) return state;
  const next = clone(state);
  const put = (ref: SlotRef, id: string): void => {
    if (ref.zone === 'tray') next.tray[ref.index] = id;
    else next[ref.zone][ref.index] = id;
  };
  put(from, b);
  put(to, a);
  return next;
}

export const isComplete = (state: ArrangeState): boolean =>
  state.tray.length === 0 && PILES.every((pile) => state[pile].every((id) => id !== null));

export const placedCount = (state: ArrangeState): number =>
  PILES.reduce((sum, pile) => sum + state[pile].filter((id) => id !== null).length, 0);

export function toArrangement(state: ArrangeState): ArrangementIds | null {
  if (!isComplete(state)) return null;
  return {
    front: state.front as string[],
    middle: state.middle as string[],
    back: state.back as string[],
  };
}

export type PileStatus = 'incomplete' | 'ok' | 'foul';

export interface PileAnalysis {
  count: number;
  size: number;
  label: string | null;
  status: PileStatus;
}

export interface ArrangeAnalysis {
  piles: Record<Pile, PileAnalysis>;
  complete: boolean;
  foul: boolean;
  /** Cặp chi bị lủng: front>middle và/hoặc middle>back. */
  frontMiddle: boolean;
  middleBack: boolean;
}

const pileCards = (state: ArrangeState, pile: Pile, byId: Map<string, Card>): Card[] =>
  state[pile].filter((id): id is string => id !== null).map((id) => byId.get(id) as Card);

/** Nhãn loại bài theo thời gian thực cho từng chi và kiểm tra binh lủng (chỉ khi các chi liền kề đã đủ lá). */
export function analyze(state: ArrangeState, cards: readonly Card[]): ArrangeAnalysis {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const hands = {} as Record<Pile, Card[]>;
  for (const pile of PILES) hands[pile] = pileCards(state, pile, byId);
  const full = (pile: Pile): boolean => hands[pile].length === PILE_SIZES[pile];
  const frontMiddle = full('front') && full('middle') && compareHands(hands.front, hands.middle) > 0;
  const middleBack = full('middle') && full('back') && compareHands(hands.middle, hands.back) > 0;
  const foulPiles: Record<Pile, boolean> = {
    front: frontMiddle,
    middle: frontMiddle || middleBack,
    back: middleBack,
  };
  const piles = {} as Record<Pile, PileAnalysis>;
  for (const pile of PILES) {
    const isFull = full(pile);
    piles[pile] = {
      count: hands[pile].length,
      size: PILE_SIZES[pile],
      label: isFull ? evaluateHand(hands[pile]).label : null,
      status: !isFull ? 'incomplete' : foulPiles[pile] ? 'foul' : 'ok',
    };
  }
  const complete = isComplete(state);
  return {
    piles,
    complete,
    foul: complete ? isBinhLung(hands as Hands) : frontMiddle || middleBack,
    frontMiddle,
    middleBack,
  };
}

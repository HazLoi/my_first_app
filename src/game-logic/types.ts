export type Suit = '♠' | '♣' | '♦' | '♥';

/** Cùng định dạng với API PHP: {id:'clubs-7', suit:'♣', value:7, label:'7'}. */
export interface Card {
  id: string;
  suit: Suit;
  value: number;
  label: string;
}

export type Pile = 'front' | 'middle' | 'back';
export const PILES: readonly Pile[] = ['front', 'middle', 'back'] as const;
export const PILE_SIZES: Record<Pile, number> = { front: 3, middle: 5, back: 5 };
/** Chi 1 = front (3 lá), chi 2 = middle, chi 3 = back. */
export const PILE_NUMBER: Record<Pile, number> = { front: 1, middle: 2, back: 3 };

export const Category = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR: 7,
  STRAIGHT_FLUSH: 8,
} as const;
export type CategoryName = keyof typeof Category;
export const CATEGORY_NAMES = Object.keys(Category) as CategoryName[];

export interface EvaluatedHand {
  category: number;
  tieBreakers: number[];
  label: string;
}

export type Hands = Record<Pile, Card[]>;
/** Bài xếp gửi lên server: id lá bài theo từng chi. */
export type ArrangementIds = Record<Pile, string[]>;

export type ChiOutcome = 'win' | 'loss' | 'tie';

export interface ChiResult {
  outcome: ChiOutcome;
  label: string;
  hand: string;
  points: number;
}

export interface PairDetail {
  opponentId: string;
  chi: Record<Pile, number>;
  sum: number;
  multiplier: number;
  white: boolean;
  sapHam: boolean;
  total: number;
}

export interface PlayerScore {
  id: string;
  name: string;
  points: number;
  bonus: number;
  sapLang: boolean;
  white: string | null;
  whiteLabel: string | null;
  hands: Hands;
  chi: Record<Pile, ChiResult>;
  pairs: PairDetail[];
  chips?: number;
  balanceAfter?: number;
  balanceBefore?: number;
}

export interface ScoreInput {
  id: string;
  name: string;
  hands: Hands;
}

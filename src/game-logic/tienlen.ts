export type TienLenSuit = 'spades' | 'clubs' | 'diamonds' | 'hearts';
export interface TienLenCard { rank: number; suit: TienLenSuit }
export type ComboType = 'single' | 'pair' | 'triple' | 'four' | 'straight' | 'pairs_run';
export interface Combo { type: ComboType; count: number; strength: number; cards: TienLenCard[] }
export type ChopRules = Record<string, string[]>;

const suits: TienLenSuit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
export const strength = (card: TienLenCard): number =>
  (card.rank === 2 ? 15 : card.rank) * 4 + suits.indexOf(card.suit);
export const cardKey = (card: TienLenCard): string => `${card.rank}-${card.suit}`;

export function classify(cards: TienLenCard[]): Combo | null {
  if (!cards.length || cards.length > 13 || cards.some((c) =>
    !Number.isInteger(c.rank) || c.rank < 2 || c.rank > 14 || !suits.includes(c.suit)) ||
    new Set(cards.map(cardKey)).size !== cards.length) return null;
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  let type: ComboType | undefined;
  if (ranks.length === 1) type = (['single', 'pair', 'triple', 'four'] as const)[cards.length - 1];
  else if (!counts.has(2) && ranks[ranks.length - 1]! - ranks[0]! + 1 === ranks.length) {
    if (cards.length >= 3 && ranks.length === cards.length) type = 'straight';
    else if (ranks.length >= 3 && [...counts.values()].every((n) => n === 2)) type = 'pairs_run';
  }
  return type ? { type, count: cards.length, strength: Math.max(...cards.map(strength)), cards } : null;
}

function chopKey(combo: Combo): string | null {
  if (combo.type === 'single' && combo.cards[0]?.rank === 2) return 'single_two';
  if (combo.type === 'pair' && combo.cards[0]?.rank === 2) return 'pair_twos';
  if (combo.type === 'four') return 'four';
  if (combo.type === 'pairs_run' && (combo.count === 6 || combo.count === 8)) return `pairs_run_${combo.count / 2}`;
  return null;
}

export function beats(candidate: Combo, table: Combo, rules: ChopRules): boolean {
  if (candidate.type === table.type && candidate.count === table.count) return candidate.strength > table.strength;
  const from = chopKey(candidate), target = chopKey(table);
  return from !== null && target !== null && (rules[from]?.includes(target) ?? false);
}

export function playable(hand: TienLenCard[], table: Combo | null, required: TienLenCard | null, rules: ChopRules): TienLenCard[][] {
  const result: TienLenCard[][] = [];
  for (let mask = 1; mask < 2 ** hand.length; mask++) {
    const cards = hand.filter((_, index) => (mask & (1 << index)) !== 0);
    if (required && !cards.some((card) => cardKey(card) === cardKey(required))) continue;
    const combo = classify(cards);
    if (combo && (!table || beats(combo, table, rules))) result.push(cards);
  }
  return result.sort((a, b) => a.length - b.length || strength(a[a.length - 1]!) - strength(b[b.length - 1]!));
}

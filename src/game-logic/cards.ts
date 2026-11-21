import type { Card, Suit } from './types';

export const SUIT_ORDER: { code: string; symbol: Suit }[] = [
  { code: 'clubs', symbol: '♣' },
  { code: 'diamonds', symbol: '♦' },
  { code: 'hearts', symbol: '♥' },
  { code: 'spades', symbol: '♠' },
];

const FACE: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const rankLabel = (value: number): string => FACE[value] ?? String(value);

/** Bộ bài 52 lá theo đúng thứ tự gốc của PHP (chưa xáo). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const { code, symbol } of SUIT_ORDER) {
    for (let value = 2; value <= 14; value++) {
      deck.push({ id: `${code}-${value}`, suit: symbol, value, label: rankLabel(value) });
    }
  }
  return deck;
}

export const isRed = (card: Card): boolean => card.suit === '♦' || card.suit === '♥';

export function cardById(cards: readonly Card[]): Map<string, Card> {
  return new Map(cards.map((card) => [card.id, card]));
}

const DECK_INDEX = new Map(createDeck().map((card) => [card.id, card]));
/** Tra lá bài chuẩn theo id (dùng khi chỉ có id từ server). */
export const cardFromId = (id: string): Card | undefined => DECK_INDEX.get(id);

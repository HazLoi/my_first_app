import { rankLabel } from './cards';
import { Category, type Card, type EvaluatedHand } from './types';

type Group = [value: number, count: number];

/** Đánh giá 3 hoặc 5 lá — khớp zingplayEvaluate() của PHP (chi 3 lá chỉ có Mậu thầu/Đôi/Sám cô). */
export function evaluateHand(cards: readonly Card[]): EvaluatedHand {
  if (cards.length !== 3 && cards.length !== 5) {
    throw new Error('Mỗi chi phải có 3 hoặc 5 lá.');
  }
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups: Group[] = [...counts.entries()].sort((l, r) => r[1] - l[1] || r[0] - l[0]);
  const g0 = groups[0] as Group;
  const g1 = groups[1];
  const isFlush = new Set(cards.map((card) => card.suit)).size === 1;
  const ascending = [...new Set(values)].sort((a, b) => a - b);
  const wheel = cards.length === 5 && ascending.join() === '2,3,4,5,14';
  const lowest = ascending[0] as number;
  const highest = ascending[ascending.length - 1] as number;
  const isStraight = ascending.length === cards.length && (wheel || highest - lowest === cards.length - 1);
  const straightHigh = wheel ? 5 : highest;
  const label = (prefix: string, value: number): string => `${prefix} ${rankLabel(value)}`;

  if (cards.length === 3) {
    if (g0[1] === 3) return { category: Category.THREE, tieBreakers: [g0[0]], label: label('Sám cô', g0[0]) };
    if (g0[1] === 2) {
      return { category: Category.PAIR, tieBreakers: [g0[0], (g1 as Group)[0]], label: label('Đôi', g0[0]) };
    }
    return { category: Category.HIGH_CARD, tieBreakers: values, label: label('Mậu thầu', values[0] as number) };
  }
  if (isStraight && isFlush) {
    return { category: Category.STRAIGHT_FLUSH, tieBreakers: [straightHigh], label: label('Thùng phá sảnh', straightHigh) };
  }
  if (g0[1] === 4) {
    return { category: Category.FOUR, tieBreakers: [g0[0], (g1 as Group)[0]], label: label('Tứ quý', g0[0]) };
  }
  if (g0[1] === 3 && g1 && g1[1] === 2) {
    return { category: Category.FULL_HOUSE, tieBreakers: [g0[0], g1[0]], label: label('Cù lũ', g0[0]) };
  }
  if (isFlush) return { category: Category.FLUSH, tieBreakers: values, label: label('Thùng', values[0] as number) };
  if (isStraight) return { category: Category.STRAIGHT, tieBreakers: [straightHigh], label: label('Sảnh', straightHigh) };
  if (g0[1] === 3) {
    return { category: Category.THREE, tieBreakers: groups.map((g) => g[0]), label: label('Sám cô', g0[0]) };
  }
  if (g0[1] === 2 && g1 && g1[1] === 2) {
    return {
      category: Category.TWO_PAIR,
      tieBreakers: [g0[0], g1[0], (groups[2] as Group)[0]],
      label: `Hai đôi ${rankLabel(g0[0])} và ${rankLabel(g1[0])}`,
    };
  }
  if (g0[1] === 2) {
    return { category: Category.PAIR, tieBreakers: groups.map((g) => g[0]), label: label('Đôi', g0[0]) };
  }
  return { category: Category.HIGH_CARD, tieBreakers: values, label: label('Mậu thầu', values[0] as number) };
}

export function compareEvaluated(first: EvaluatedHand, second: EvaluatedHand): -1 | 0 | 1 {
  if (first.category !== second.category) return first.category > second.category ? 1 : -1;
  const length = Math.max(first.tieBreakers.length, second.tieBreakers.length);
  for (let i = 0; i < length; i++) {
    const a = first.tieBreakers[i] ?? 0;
    const b = second.tieBreakers[i] ?? 0;
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}

/** -1/0/1. Bằng hoàn toàn về rank thì hòa (không so chất, giống PHP). */
export function compareHands(left: readonly Card[], right: readonly Card[]): -1 | 0 | 1 {
  return compareEvaluated(evaluateHand(left), evaluateHand(right));
}

const BASE = 15;
const BASE_POW = [BASE ** 4, BASE ** 3, BASE ** 2, BASE, 1];

/** Quy đổi bài thành một số nguyên để so sánh nhanh (cùng thứ tự với compareEvaluated). */
export function handValue(hand: EvaluatedHand): number {
  let value = hand.category * BASE ** 5;
  for (let i = 0; i < 5; i++) value += (hand.tieBreakers[i] ?? 0) * (BASE_POW[i] as number);
  return value;
}

import { RULES, type WhiteKey } from '@/config/rules';
import { isRed } from './cards';
import type { Card } from './types';

/** Các dãy sảnh theo rank: A-2-3.. (A thấp) và 2..A; không có K-A-2. */
const runs = (length: number): number[][] => {
  const result: number[][] = [[14, ...Array.from({ length: length - 1 }, (_, i) => i + 2)]];
  for (let start = 2; start + length - 1 <= 14; start++) {
    result.push(Array.from({ length }, (_, i) => start + i));
  }
  return result;
};
const RUNS_3 = runs(3);
const RUNS_5 = runs(5);

/** Ba sảnh (3+5+5): mỗi rank xuất hiện tối đa 3 lần, thử ghép ba dãy rank khớp đúng số lượng lá. */
function hasThreeStraights(cards: readonly Card[]): boolean {
  const need = new Array<number>(15).fill(0);
  for (const card of cards) need[card.value] = (need[card.value] as number) + 1;
  if (need.some((count) => count > 3)) return false;
  const left = need.slice();
  const take = (rankSet: number[], delta: number): boolean => {
    let ok = true;
    for (const rank of rankSet) {
      left[rank] = (left[rank] as number) + delta;
      if ((left[rank] as number) < 0) ok = false;
    }
    return ok;
  };
  for (const front of RUNS_3) {
    const frontOk = take(front, -1);
    if (frontOk) {
      for (const middle of RUNS_5) {
        const middleOk = take(middle, -1);
        if (middleOk) {
          for (const back of RUNS_5) {
            const backOk = take(back, -1);
            if (backOk && left.every((count) => count === 0)) {
              take(back, 1);
              take(middle, 1);
              take(front, 1);
              return true;
            }
            take(back, 1);
          }
        }
        take(middle, 1);
      }
    }
    take(front, 1);
  }
  return false;
}

function hasThreeFlushes(cards: readonly Card[]): boolean {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  const key = [...counts.values()].sort((a, b) => b - a).join();
  return key === '13' || key === '8,5' || key === '10,3' || key === '5,5,3';
}

/** Tới trắng của bộ 13 lá: key có rank cao nhất thỏa, hoặc null (khớp zingplayDetectWhite). */
export function detectWhite(cards: readonly Card[]): WhiteKey | null {
  if (!RULES.white.enabled || cards.length !== 13) return null;
  const values = cards.map((card) => card.value);
  const suits = new Set(cards.map((card) => card.suit));
  const distinct = new Set(values);
  if (suits.size === 1 && distinct.size === 13) return 'rong_cuon';
  if (distinct.size === 13) return 'sanh_rong';
  const red = cards.filter(isRed).length;
  if (red === 13 || red === 0) return 'cung_mau_13';
  if (red === 12 || red === 1) return 'cung_mau_12';
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let pairs = 0;
  for (const count of counts.values()) pairs += Math.floor(count / 2);
  if (pairs >= 6) return 'sau_doi';
  if (hasThreeStraights(cards)) return 'ba_sanh';
  if (hasThreeFlushes(cards)) return 'ba_thung';
  return null;
}

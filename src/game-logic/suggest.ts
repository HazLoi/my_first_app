import { RULES } from '@/config/rules';
import { evaluateHand, handValue } from './evaluate';
import { handsToArrangement } from './arrangement';
import type { ArrangementIds, Card, Hands } from './types';
import { Category } from './types';

export type StrategyName = 'balanced' | 'strongBack' | 'winFront';

export interface Suggestion {
  arrangement: ArrangementIds;
  hands: Hands;
  score: number;
  strategy: StrategyName;
  /** Giá trị số của từng chi (front, middle, back) để so sánh/loại trùng. */
  values: [number, number, number];
}

const STEP = 15 ** 5;
const FULL = (1 << 13) - 1;

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, chosen: number[]): void => {
    if (chosen.length === k) {
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      chosen.push(i);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return out;
}

const FIVE_OF_13 = combinations(13, 5);
const FIVE_OF_8 = combinations(8, 5);

interface Tables {
  value: Float64Array;
  bonusFront: Float64Array;
  bonusMiddle: Float64Array;
  bonusBack: Float64Array;
}

const maskOf = (indices: number[]): number => indices.reduce((mask, index) => mask | (1 << index), 0);

function buildTables(cards: readonly Card[], needFront: boolean): Tables {
  const size = 1 << 13;
  const tables: Tables = {
    value: new Float64Array(size),
    bonusFront: new Float64Array(size),
    bonusMiddle: new Float64Array(size),
    bonusBack: new Float64Array(size),
  };
  for (const combo of FIVE_OF_13) {
    const hand = evaluateHand(combo.map((i) => cards[i] as Card));
    const mask = maskOf(combo);
    tables.value[mask] = handValue(hand);
    if (hand.category === Category.FULL_HOUSE) tables.bonusMiddle[mask] = STEP;
    else if (hand.category === Category.FOUR) {
      tables.bonusMiddle[mask] = 4 * STEP;
      tables.bonusBack[mask] = 2 * STEP;
    } else if (hand.category === Category.STRAIGHT_FLUSH) {
      tables.bonusMiddle[mask] = 5 * STEP;
      tables.bonusBack[mask] = 3 * STEP;
    }
  }
  if (needFront) {
    for (const combo of combinations(13, 3)) {
      const hand = evaluateHand(combo.map((i) => cards[i] as Card));
      const mask = maskOf(combo);
      tables.value[mask] = handValue(hand);
      if (hand.category === Category.THREE) tables.bonusFront[mask] = 2 * STEP;
    }
  }
  return tables;
}

interface Candidate {
  front: number;
  middle: number;
  back: number;
}

// Cấu trúc tổ hợp không phụ thuộc lá bài nên tính một lần: 1287 × 56 = 72.072 phương án (chi 3, chi 2, chi 1).
const COMBO_COUNT = FIVE_OF_13.length * FIVE_OF_8.length;
const BACK_MASKS = new Int32Array(COMBO_COUNT);
const MIDDLE_MASKS = new Int32Array(COMBO_COUNT);
const FRONT_MASKS = new Int32Array(COMBO_COUNT);
{
  let k = 0;
  for (const backCombo of FIVE_OF_13) {
    const back = maskOf(backCombo);
    const rest: number[] = [];
    for (let i = 0; i < 13; i++) if (!(back & (1 << i))) rest.push(i);
    for (const pattern of FIVE_OF_8) {
      let middle = 0;
      for (let p = 0; p < 5; p++) middle |= 1 << (rest[pattern[p] as number] as number);
      BACK_MASKS[k] = back;
      MIDDLE_MASKS[k] = middle;
      FRONT_MASKS[k] = FULL ^ back ^ middle;
      k++;
    }
  }
}

/** Chỉ số các phương án không lủng (chi 1 ≤ chi 2 ≤ chi 3). */
function enumerateValid(tables: Tables): Int32Array {
  const valid = new Int32Array(COMBO_COUNT);
  let count = 0;
  const value = tables.value;
  for (let k = 0; k < COMBO_COUNT; k++) {
    const vMiddle = value[MIDDLE_MASKS[k] as number] as number;
    if (vMiddle > (value[BACK_MASKS[k] as number] as number)) continue;
    if ((value[FRONT_MASKS[k] as number] as number) > vMiddle) continue;
    valid[count++] = k;
  }
  return valid.subarray(0, count);
}

const indicesOf = (mask: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < 13; i++) if (mask & (1 << i)) out.push(i);
  return out;
};

function toSuggestion(cards: readonly Card[], candidate: Candidate, tables: Tables, score: number, strategy: StrategyName): Suggestion {
  const pick = (mask: number): Card[] => indicesOf(mask).map((i) => cards[i] as Card);
  const hands: Hands = { front: pick(candidate.front), middle: pick(candidate.middle), back: pick(candidate.back) };
  return {
    arrangement: handsToArrangement(hands),
    hands,
    score,
    strategy,
    values: [tables.value[candidate.front] as number, tables.value[candidate.middle] as number, tables.value[candidate.back] as number],
  };
}

const TOP_K = 80;

/**
 * Gợi ý xếp bài (13 lá): duyệt C(13,5)×C(8,5) phương án, bỏ lủng, chấm điểm theo trọng số,
 * khử trùng phương án tương đương và ưu tiên đa dạng chiến lược. Luôn có ít nhất một phương án.
 */
export function suggestArrangements(cards: readonly Card[], limit = 5): Suggestion[] {
  if (cards.length !== 13) throw new Error('Cần đúng 13 lá để gợi ý.');
  const tables = buildTables(cards, true);
  const valid = enumerateValid(tables);
  if (valid.length === 0) throw new Error('Không tìm thấy phương án không lủng.');

  const candidateAt = (k: number): Candidate => ({
    front: FRONT_MASKS[k] as number,
    middle: MIDDLE_MASKS[k] as number,
    back: BACK_MASKS[k] as number,
  });
  const scoreAt = (k: number, strategy: StrategyName): number => {
    const w = RULES.suggest.strategies[strategy];
    const back = BACK_MASKS[k] as number;
    const middle = MIDDLE_MASKS[k] as number;
    const front = FRONT_MASKS[k] as number;
    return (
      w.back * ((tables.value[back] as number) + (tables.bonusBack[back] as number)) +
      w.middle * ((tables.value[middle] as number) + (tables.bonusMiddle[middle] as number)) +
      w.front * ((tables.value[front] as number) + (tables.bonusFront[front] as number))
    );
  };
  // Giữ TOP_K phương án điểm cao nhất (chèn vào mảng nhỏ đã sắp xếp) thay vì sắp xếp 72k phần tử.
  const topFor = (strategy: StrategyName): { k: number; score: number }[] => {
    const top: { k: number; score: number }[] = [];
    for (let i = 0; i < valid.length; i++) {
      const k = valid[i] as number;
      const score = scoreAt(k, strategy);
      if (top.length === TOP_K && score <= (top[TOP_K - 1] as { score: number }).score) continue;
      let position = top.length;
      while (position > 0 && (top[position - 1] as { score: number }).score < score) position--;
      top.splice(position, 0, { k, score });
      if (top.length > TOP_K) top.pop();
    }
    return top;
  };

  const picked: Suggestion[] = [];
  const seen = new Set<string>();
  const take = (list: { k: number; score: number }[], strategy: StrategyName, count: number): void => {
    let added = 0;
    for (const { k, score } of list) {
      if (picked.length >= limit || added >= count) return;
      const candidate = candidateAt(k);
      const key = `${tables.value[candidate.front]}|${tables.value[candidate.middle]}|${tables.value[candidate.back]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(toSuggestion(cards, candidate, tables, score, strategy));
      added++;
    }
  };

  const balanced = topFor('balanced');
  take(balanced, 'balanced', 1);
  take(topFor('strongBack'), 'strongBack', 1);
  take(topFor('winFront'), 'winFront', 1);
  take(balanced, 'balanced', limit);
  return picked.slice(0, limit);
}

/** Phương án tốt nhất, luôn không lủng. */
export function autoArrange(cards: readonly Card[]): Suggestion {
  return suggestArrangements(cards, 1)[0] as Suggestion;
}

/** Xếp nhanh cho đối thủ giả định: chi 3 mạnh nhất, rồi chi 2 mạnh nhất từ phần còn lại (có thể lủng). */
export function greedyArrange(cards: readonly Card[]): Hands {
  const tables = buildTables(cards, false);
  let bestBack = 0;
  let bestValue = -1;
  for (const combo of FIVE_OF_13) {
    const mask = maskOf(combo);
    if ((tables.value[mask] as number) > bestValue) {
      bestValue = tables.value[mask] as number;
      bestBack = mask;
    }
  }
  const rest: number[] = [];
  for (let i = 0; i < 13; i++) if (!(bestBack & (1 << i))) rest.push(i);
  let bestMiddle = 0;
  bestValue = -1;
  for (const pattern of FIVE_OF_8) {
    const mask = maskOf(pattern.map((p) => rest[p] as number));
    if ((tables.value[mask] as number) > bestValue) {
      bestValue = tables.value[mask] as number;
      bestMiddle = mask;
    }
  }
  const pick = (mask: number): Card[] => indicesOf(mask).map((i) => cards[i] as Card);
  return { front: pick(FULL ^ bestBack ^ bestMiddle), middle: pick(bestMiddle), back: pick(bestBack) };
}

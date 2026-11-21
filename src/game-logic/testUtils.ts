import { SUIT_ORDER, rankLabel } from './cards';
import type { Card, Suit } from './types';

const SUIT_BY_LETTER: Record<string, { code: string; symbol: Suit }> = {
  C: SUIT_ORDER[0]!,
  D: SUIT_ORDER[1]!,
  H: SUIT_ORDER[2]!,
  S: SUIT_ORDER[3]!,
};
const VALUE_BY_TOKEN: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };

/** Tạo lá bài từ ký hiệu ngắn, ví dụ "AS 10H 7C" (rank + chất S/C/D/H). Chỉ dùng trong test. */
export function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map((token) => {
    const suit = SUIT_BY_LETTER[token.slice(-1)];
    const rank = token.slice(0, -1);
    const value = VALUE_BY_TOKEN[rank] ?? Number(rank);
    if (!suit || !Number.isInteger(value)) throw new Error(`Lá bài không hợp lệ: ${token}`);
    return { id: `${suit.code}-${value}`, suit: suit.symbol, value, label: rankLabel(value) };
  });
}

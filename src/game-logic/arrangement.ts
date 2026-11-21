import { cardById } from './cards';
import { compareHands } from './evaluate';
import { PILES, PILE_SIZES, type ArrangementIds, type Card, type Hands } from './types';

export interface ArrangementCheck {
  valid: boolean;
  message?: string;
  hands?: Hands;
}

/** Binh lủng: chi 1 > chi 2 hoặc chi 2 > chi 3 (bằng nhau thì KHÔNG lủng). */
export function isBinhLung(hands: Hands): boolean {
  return compareHands(hands.front, hands.middle) > 0 || compareHands(hands.middle, hands.back) > 0;
}

/** Khớp zingplayValidateArrangement(): đủ 13 lá, không trùng, đúng 3/5/5, không lủng. */
export function isValidArrangement(cards: readonly Card[], arrangement: ArrangementIds): ArrangementCheck {
  for (const pile of PILES) {
    if (!Array.isArray(arrangement[pile]) || arrangement[pile].length !== PILE_SIZES[pile]) {
      return { valid: false, message: 'Mỗi chi cần đúng số lá quy định.' };
    }
  }
  const submitted = [...arrangement.front, ...arrangement.middle, ...arrangement.back];
  const handIds = new Set(cards.map((card) => card.id));
  if (
    submitted.length !== 13 ||
    new Set(submitted).size !== 13 ||
    submitted.some((id) => !handIds.has(id)) ||
    cards.length !== 13
  ) {
    return { valid: false, message: 'Bài xếp phải dùng đủ 13 lá riêng biệt trên tay.' };
  }
  const hands = arrangementToHands(cards, arrangement);
  if (isBinhLung(hands)) {
    return {
      valid: false,
      message: 'Binh lủng: chi cuối phải mạnh hơn chi giữa, chi giữa mạnh hơn chi đầu.',
      hands,
    };
  }
  return { valid: true, hands };
}

export function arrangementToHands(cards: readonly Card[], arrangement: ArrangementIds): Hands {
  const byId = cardById(cards);
  const pick = (ids: string[]): Card[] => ids.map((id) => byId.get(id) as Card);
  return { front: pick(arrangement.front), middle: pick(arrangement.middle), back: pick(arrangement.back) };
}

export function handsToArrangement(hands: Hands): ArrangementIds {
  return {
    front: hands.front.map((card) => card.id),
    middle: hands.middle.map((card) => card.id),
    back: hands.back.map((card) => card.id),
  };
}

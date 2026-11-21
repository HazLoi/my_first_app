import { arrangementToHands, handsToArrangement, isBinhLung } from './arrangement';
import { createDeck } from './cards';
import { compareHands, evaluateHand } from './evaluate';
import { shuffleWith, type Rng } from './shuffle';
import { autoArrange, greedyArrange, suggestArrangements } from './suggest';
import { chiValue } from './scoring';
import { PILES, type ArrangementIds, type Card, type Hands } from './types';

export type BotLevel = 'easy' | 'medium' | 'hard';

function randomValid(cards: readonly Card[], rng: Rng): Hands | null {
  for (let attempt = 0; attempt < 300; attempt++) {
    const shuffled = shuffleWith(cards, rng);
    const hands: Hands = { front: shuffled.slice(0, 3), middle: shuffled.slice(3, 8), back: shuffled.slice(8, 13) };
    if (!isBinhLung(hands)) return hands;
  }
  return null;
}

/** Điểm kỳ vọng của một phương án khi đấu với các đối thủ giả định lấy từ phần bài còn lại. */
function expectedScore(hands: Hands, mine: readonly Card[], rng: Rng, samples: number): number {
  const taken = new Set(mine.map((card) => card.id));
  const remaining = createDeck().filter((card) => !taken.has(card.id));
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const opponent = greedyArrange(shuffleWith(remaining, rng).slice(0, 13));
    for (const pile of PILES) {
      const result = compareHands(hands[pile], opponent[pile]);
      if (result > 0) total += chiValue(pile, evaluateHand(hands[pile]));
      else if (result < 0) total -= chiValue(pile, evaluateHand(opponent[pile]));
    }
  }
  return total / samples;
}

/** Bot xếp bài: dễ = ngẫu nhiên không lủng, vừa = gợi ý #1, khó = chọn phương án kỳ vọng thắng cao nhất. */
export function botArrange(cards: readonly Card[], level: BotLevel, rng: Rng): ArrangementIds {
  if (level === 'easy') {
    const hands = randomValid(cards, rng);
    return hands ? handsToArrangement(hands) : autoArrange(cards).arrangement;
  }
  if (level === 'medium') return autoArrange(cards).arrangement;
  const options = suggestArrangements(cards, 5);
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const option of options) {
    const score = expectedScore(arrangementToHands(cards, option.arrangement), cards, rng, 30);
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best.arrangement;
}

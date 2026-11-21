const SUITS = ['spades', 'clubs', 'diamonds', 'hearts'];
const TYPE_ORDER = ['single', 'pair', 'triple', 'four', 'straight', 'pairs_run'];
const TYPE_LABELS = {
  single: 'Lẻ',
  pair: 'Đôi',
  triple: 'Sám',
  four: 'Tứ quý',
  straight: 'Sảnh',
  pairs_run: 'Đôi thông',
};
const RANK_LABELS = {
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
};

export const cardKey = (card) => `${card.rank}-${card.suit}`;

const cardStrength = (card) =>
  (card.rank === 2 ? 15 : card.rank) * 4 + SUITS.indexOf(card.suit);

function classify(cards) {
  if (!cards.length || cards.length > 13 ||
      cards.some((card) => !Number.isInteger(card.rank) || card.rank < 2 || card.rank > 14 ||
        !SUITS.includes(card.suit)) ||
      new Set(cards.map(cardKey)).size !== cards.length) return null;

  const counts = new Map();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const ranks = [...counts.keys()].sort((a, b) => a - b);
  let type = null;
  if (ranks.length === 1) {
    type = [null, 'single', 'pair', 'triple', 'four'][cards.length] ?? null;
  } else if (!counts.has(2) && ranks.at(-1) - ranks[0] + 1 === ranks.length) {
    if (cards.length >= 3 && ranks.length === cards.length) type = 'straight';
    else if (ranks.length >= 3 && cards.length === ranks.length * 2 &&
        [...counts.values()].every((count) => count === 2)) type = 'pairs_run';
  }
  if (!type) return null;
  return {
    type,
    count: cards.length,
    strength: Math.max(...cards.map(cardStrength)),
  };
}

function chopKey(combo) {
  if (combo.type === 'single' && combo.cards[0]?.rank === 2) return 'single_two';
  if (combo.type === 'pair' && combo.cards[0]?.rank === 2) return 'pair_twos';
  if (combo.type === 'four') return 'four';
  if (combo.type === 'pairs_run' && (combo.count === 6 || combo.count === 8)) {
    return `pairs_run_${combo.count / 2}`;
  }
  return null;
}

function beats(candidate, target, rules) {
  if (candidate.type === target.type && candidate.count === target.count) {
    return candidate.strength > target.strength;
  }
  const from = chopKey(candidate);
  const to = chopKey(target);
  return from !== null && to !== null && (rules[from]?.includes(to) ?? false);
}

function rankLabel(rank) {
  return RANK_LABELS[rank] ?? String(rank);
}

function comboLabel(combo) {
  if (combo.type === 'straight') {
    return `Sảnh ${[...new Set(combo.cards.map((card) => card.rank))]
      .sort((a, b) => a - b).map(rankLabel).join('')}`;
  }
  if (combo.type === 'pairs_run') {
    const ranks = [...new Set(combo.cards.map((card) => card.rank))].sort((a, b) => a - b);
    return `Đôi thông ${ranks.map((rank) => `${rankLabel(rank)}${rankLabel(rank)}`).join('-')}`;
  }
  return `${TYPE_LABELS[combo.type]} ${rankLabel(combo.cards[0].rank)}`;
}

function compareCombos(a, b) {
  return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
    a.count - b.count || a.strength - b.strength ||
    a.cards.map(cardKey).join(',').localeCompare(b.cards.map(cardKey).join(','));
}

/**
 * Enumerate valid combinations in the hand. Pass tappedCard to keep only
 * combinations containing that card. table accepts the current combo and rules.
 */
export function suggestCombos(hand, table = null, tappedCard = null) {
  const target = table?.combo ?? null;
  const required = table?.required ?? null;
  const rules = table?.chopRules ?? {};
  const tappedKey = tappedCard ? cardKey(tappedCard) : null;
  const suggestions = [];

  for (let mask = 1; mask < 2 ** hand.length; mask++) {
    const cards = hand.filter((_, index) => (mask & (1 << index)) !== 0);
    if (required && !cards.some((card) => cardKey(card) === cardKey(required))) continue;
    if (tappedKey && !cards.some((card) => cardKey(card) === tappedKey)) continue;
    const combo = classify(cards);
    if (!combo) continue;
    if (target && !beats({ ...combo, cards }, target, rules)) continue;
    const isChop = Boolean(target && chopKey({ ...combo, cards }) &&
      chopKey(target) && !(combo.type === target.type && combo.count === target.count));
    suggestions.push({
      ...combo,
      cards,
      label: comboLabel({ ...combo, cards }),
      isChop,
    });
  }
  return suggestions.sort(compareCombos);
}

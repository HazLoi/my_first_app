"use strict";

const SUITS = [
  { code: "clubs", symbol: "♣" },
  { code: "diamonds", symbol: "♦" },
  { code: "hearts", symbol: "♥" },
  { code: "spades", symbol: "♠" },
];
const RANK_LABELS = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};
const PILES = ["front", "middle", "back"];
const PILE_SIZES = { front: 3, middle: 5, back: 5 };

function createDeck(random = Math.random) {
  const deck = [];
  for (const suit of SUITS) {
    for (let value = 2; value <= 14; value++) {
      deck.push({
        id: `${suit.code}-${value}`,
        suit: suit.symbol,
        value,
        label: RANK_LABELS[value] || String(value),
      });
    }
  }
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function evaluate(cards) {
  if (!Array.isArray(cards) || ![3, 5].includes(cards.length)) {
    throw new TypeError("Mỗi chi phải có 3 hoặc 5 lá.");
  }

  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const groups = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || right[0] - left[0],
  );
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const uniqueAscending = [...new Set(values)].sort((a, b) => a - b);
  const isWheel = cards.length === 5
    ? uniqueAscending.join(",") === "2,3,4,5,14"
    : uniqueAscending.join(",") === "2,3,14";
  const isStraight = uniqueAscending.length === cards.length &&
    (isWheel || uniqueAscending.at(-1) - uniqueAscending[0] === cards.length - 1);
  const straightHigh = isWheel ? 5 : uniqueAscending.at(-1);
  const labelRank = (value) => RANK_LABELS[value] || String(value);

  let category;
  let tieBreakers;
  let label;
  if (cards.length === 3) {
    if (groups[0][1] === 3) {
      [category, tieBreakers, label] = [3, [groups[0][0]], `Sám ${labelRank(groups[0][0])}`];
    } else if (groups[0][1] === 2) {
      [category, tieBreakers, label] = [
        1,
        [groups[0][0], groups[1][0]],
        `Đôi ${labelRank(groups[0][0])}`,
      ];
    } else {
      [category, tieBreakers, label] = [0, values, `Mậu thầu ${labelRank(values[0])}`];
    }
  } else if (isStraight && isFlush) {
    [category, tieBreakers, label] = [8, [straightHigh], "Thùng phá sảnh"];
  } else if (groups[0][1] === 4) {
    [category, tieBreakers, label] = [
      7,
      [groups[0][0], groups[1][0]],
      `Tứ quý ${labelRank(groups[0][0])}`,
    ];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    [category, tieBreakers, label] = [
      6,
      [groups[0][0], groups[1][0]],
      `Cù lũ ${labelRank(groups[0][0])}`,
    ];
  } else if (isFlush) {
    [category, tieBreakers, label] = [5, values, "Thùng"];
  } else if (isStraight) {
    [category, tieBreakers, label] = [4, [straightHigh], "Sảnh"];
  } else if (groups[0][1] === 3) {
    [category, tieBreakers, label] = [3, groups.map(([value]) => value), `Sám ${labelRank(groups[0][0])}`];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    [category, tieBreakers, label] = [
      2,
      [groups[0][0], groups[1][0], groups[2][0]],
      `Hai đôi ${labelRank(groups[0][0])} và ${labelRank(groups[1][0])}`,
    ];
  } else if (groups[0][1] === 2) {
    [category, tieBreakers, label] = [
      1,
      [groups[0][0], ...groups.slice(1).map(([value]) => value)],
      `Đôi ${labelRank(groups[0][0])}`,
    ];
  } else {
    [category, tieBreakers, label] = [0, values, `Mậu thầu ${labelRank(values[0])}`];
  }
  return { category, tieBreakers, label };
}

function compareHands(left, right) {
  const first = evaluate(left);
  const second = evaluate(right);
  if (first.category !== second.category) {
    return Math.sign(first.category - second.category);
  }
  for (let index = 0; index < Math.max(first.tieBreakers.length, second.tieBreakers.length); index++) {
    const difference = (first.tieBreakers[index] || 0) - (second.tieBreakers[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function validateArrangement(cards, arrangement) {
  if (!arrangement || typeof arrangement !== "object" || Array.isArray(arrangement)) {
    return { valid: false, message: "Bài xếp không hợp lệ." };
  }
  for (const pile of PILES) {
    if (!Array.isArray(arrangement[pile]) || arrangement[pile].length !== PILE_SIZES[pile]) {
      return { valid: false, message: "Mỗi chi cần đúng số lá quy định." };
    }
  }

  const submittedIds = PILES.flatMap((pile) => arrangement[pile]);
  const handIds = new Set(cards.map((card) => card.id));
  if (
    submittedIds.some((id) => typeof id !== "string" || !handIds.has(id)) ||
    new Set(submittedIds).size !== 13 ||
    submittedIds.length !== cards.length
  ) {
    return { valid: false, message: "Bài xếp phải dùng đủ 13 lá riêng biệt trên tay." };
  }

  const byId = new Map(cards.map((card) => [card.id, card]));
  const hands = Object.fromEntries(
    PILES.map((pile) => [pile, arrangement[pile].map((id) => byId.get(id))]),
  );
  if (
    compareHands(hands.front, hands.middle) > 0 ||
    compareHands(hands.middle, hands.back) > 0
  ) {
    return { valid: false, message: "Binh lủng: chi cuối phải mạnh hơn chi giữa, chi giữa mạnh hơn chi đầu." };
  }
  return { valid: true, hands };
}

function compareResults(players) {
  const totals = new Map(
    players.map((player) => [
      player.id,
      {
        id: player.id,
        name: player.name,
        points: 0,
        chi: Object.fromEntries(
          PILES.map((pile) => [
            pile,
            { wins: 0, ties: 0, losses: 0, hand: evaluate(player.hands[pile]).label },
          ]),
        ),
      },
    ]),
  );

  for (let left = 0; left < players.length; left++) {
    for (let right = left + 1; right < players.length; right++) {
      let leftWins = 0;
      let rightWins = 0;
      for (const pile of PILES) {
        const comparison = compareHands(players[left].hands[pile], players[right].hands[pile]);
        const leftStats = totals.get(players[left].id);
        const rightStats = totals.get(players[right].id);
        if (comparison > 0) {
          leftStats.points++;
          rightStats.points--;
          leftStats.chi[pile].wins++;
          rightStats.chi[pile].losses++;
          leftWins++;
        } else if (comparison < 0) {
          rightStats.points++;
          leftStats.points--;
          rightStats.chi[pile].losses++;
          leftStats.chi[pile].wins++;
          rightWins++;
        } else {
          leftStats.chi[pile].ties++;
          rightStats.chi[pile].ties++;
        }
      }
      if (leftWins === PILES.length) {
        totals.get(players[left].id).points += 3;
        totals.get(players[right].id).points -= 3;
      } else if (rightWins === PILES.length) {
        totals.get(players[right].id).points += 3;
        totals.get(players[left].id).points -= 3;
      }
    }
  }

  return [...totals.values()].map((result) => ({
    ...result,
    chi: Object.fromEntries(
      PILES.map((pile) => {
        const stats = result.chi[pile];
        const outcome = stats.wins > stats.losses
          ? "win"
          : stats.losses > stats.wins
            ? "loss"
            : "tie";
        const label = stats.wins === stats.losses
          ? stats.wins === 0 && stats.ties > 0
            ? "Hòa"
            : "Cân bằng"
          : stats.wins > stats.losses
            ? `Thắng ${stats.wins}`
            : `Thua ${stats.losses}`;
        return [pile, { outcome, label, hand: stats.hand }];
      }),
    ),
  }));
}

module.exports = {
  compareHands,
  compareResults,
  createDeck,
  evaluate,
  validateArrangement,
};

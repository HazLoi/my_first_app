"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compareHands,
  compareResults,
  createDeck,
  evaluate,
  validateArrangement,
} = require("./rules");

function cards(specs) {
  return specs.map(([value, suit], index) => ({
    id: `${index}`,
    value,
    suit,
    label: String(value),
  }));
}

test("shuffles one complete deck of unique cards", () => {
  const deck = createDeck(() => 0.5);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => card.id)).size, 52);
  assert.equal(deck.filter((card) => card.value === 14).length, 4);
});

test("evaluates poker categories and ace-low straights", () => {
  assert.equal(evaluate(cards([[9, "♠"], [9, "♥"], [9, "♦"]])).label, "Sám 9");
  assert.equal(
    evaluate(cards([[14, "♠"], [2, "♥"], [3, "♦"], [4, "♣"], [5, "♠"]])).label,
    "Sảnh",
  );
  assert.equal(
    compareHands(
      cards([[14, "♠"], [2, "♥"], [3, "♦"], [4, "♣"], [5, "♠"]]),
      cards([[2, "♠"], [3, "♥"], [4, "♦"], [5, "♣"], [6, "♠"]]),
    ),
    -1,
  );
  assert.equal(evaluate(cards([[14, "♥"], [13, "♥"], [12, "♥"]])).label, "Mậu thầu A");
  assert.equal(
    compareHands(
      cards([[14, "♠"], [13, "♠"], [12, "♠"], [11, "♠"], [10, "♠"]]),
      cards([[9, "♠"], [8, "♠"], [7, "♠"], [6, "♠"], [5, "♠"]]),
    ),
    1,
  );
});

test("accepts a complete ordered hand and rejects duplicate cards or a foul", () => {
  const hand = [
    { id: "front-a", value: 2, suit: "♠" },
    { id: "front-b", value: 3, suit: "♥" },
    { id: "front-c", value: 7, suit: "♦" },
    { id: "middle-a", value: 4, suit: "♠" },
    { id: "middle-b", value: 5, suit: "♥" },
    { id: "middle-c", value: 6, suit: "♦" },
    { id: "middle-d", value: 8, suit: "♣" },
    { id: "middle-e", value: 9, suit: "♠" },
    { id: "back-a", value: 10, suit: "♣" },
    { id: "back-b", value: 10, suit: "♦" },
    { id: "back-c", value: 10, suit: "♥" },
    { id: "back-d", value: 11, suit: "♣" },
    { id: "back-e", value: 11, suit: "♦" },
  ];
  const arrangement = {
    front: ["front-a", "front-b", "front-c"],
    middle: ["middle-a", "middle-b", "middle-c", "middle-d", "middle-e"],
    back: ["back-a", "back-b", "back-c", "back-d", "back-e"],
  };
  assert.equal(validateArrangement(hand, arrangement).valid, true);

  const duplicate = { ...arrangement, front: ["back-a", "front-b", "front-c"] };
  assert.equal(validateArrangement(hand, duplicate).valid, false);

  const foul = {
    front: ["back-a", "back-b", "back-c"],
    middle: ["middle-a", "middle-b", "middle-c", "middle-d", "middle-e"],
    back: ["front-a", "front-b", "front-c", "back-d", "back-e"],
  };
  assert.match(validateArrangement(hand, foul).message, /Binh lủng/);
});

test("scores a sweep with its per-opponent bonus", () => {
  const winner = {
    id: "winner",
    name: "Người thắng",
    hands: {
      front: cards([[8, "♠"], [8, "♥"], [8, "♦"]]),
      middle: cards([[10, "♠"], [10, "♥"], [4, "♦"], [6, "♣"], [7, "♠"]]),
      back: cards([[2, "♠"], [2, "♥"], [5, "♦"], [7, "♣"], [9, "♠"]]),
    },
  };
  const other = {
    id: "other",
    name: "Người chơi",
    hands: {
      front: cards([[14, "♠"], [14, "♥"], [13, "♦"]]),
      middle: cards([[9, "♠"], [8, "♥"], [6, "♦"], [4, "♣"], [2, "♠"]]),
      back: cards([[14, "♠"], [13, "♥"], [12, "♦"], [10, "♣"], [8, "♠"]]),
    },
  };
  const [winnerResult, otherResult] = compareResults([winner, other]);
  assert.equal(winnerResult.points, 6);
  assert.equal(otherResult.points, -6);
  assert.deepEqual(
    Object.values(winnerResult.chi).map((chi) => chi.outcome),
    ["win", "win", "win"],
  );
});

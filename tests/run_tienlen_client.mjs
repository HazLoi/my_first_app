import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { beats, cardKey, classify, playable } from '../src/game-logic/tienlen.ts';

const vectors = JSON.parse(readFileSync(new URL('./tienlen_vectors.json', import.meta.url), 'utf8'));
const suits = { S: 'spades', C: 'clubs', D: 'diamonds', H: 'hearts' };
const cards = (items) => items.map((item) => ({ rank: Number(item.slice(0, -1)), suit: suits[item.slice(-1)] }));
const rules = { pairs_run_3: ['single_two'], four: ['single_two', 'pair_twos', 'pairs_run_3'], pairs_run_4: ['single_two', 'pair_twos', 'four', 'pairs_run_3'] };
let count = 0;
for (const vector of vectors.classify) {
  assert.equal(classify(cards(vector.cards))?.type ?? null, vector.type, JSON.stringify(vector)); count++;
}
for (const vector of vectors.beats) {
  assert.equal(beats(classify(cards(vector.play)), classify(cards(vector.table)), rules), vector.wins, JSON.stringify(vector)); count++;
}
for (const rank of vectors.suitOrder.ranks) {
  for (const suit of vectors.suitOrder.suits.slice(1)) {
    assert.equal(beats(classify(cards([`${rank}${suit}`])), classify(cards([`${rank}S`])), rules), true); count++;
  }
}
const hand = cards(['3S', '3C', '4S', '4C', '5S', '5C', '2H']);
const table = classify(cards(['2S']));
const choices = playable(hand, table, null, rules);
assert(choices.some((choice) => classify(choice).type === 'pairs_run'));
assert(choices.every((choice) => beats(classify(choice), table, rules)));
assert(playable(hand, null, hand[0], rules).every((choice) => choice.some((card) => cardKey(card) === cardKey(hand[0]))));
assert(!beats(classify(cards(['3S', '3C', '4S', '4C', '5S', '5C'])), table, { pairs_run_3: [] }));
console.log(`Tiến Lên client: ${count + 4} kiểm tra đạt.`);

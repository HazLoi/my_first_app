import assert from 'node:assert/strict';
import { cardKey, suggestCombos } from '../src/game-logic/tienlen-suggest.js';

const suits = { S: 'spades', C: 'clubs', D: 'diamonds', H: 'hearts' };
const cards = (...items) => items.map((item) => ({
  rank: Number(item.slice(0, -1)),
  suit: suits[item.slice(-1)],
}));
const rules = {
  pairs_run_3: ['single_two', 'pair_twos'],
  four: ['single_two', 'pair_twos', 'pairs_run_3'],
  pairs_run_4: ['single_two', 'pair_twos', 'four', 'pairs_run_3'],
};
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
const types = (hand, table = null, tapped = null) =>
  suggestCombos(hand, table, tapped).map((combo) => combo.type);
const comboWith = (hand, count, type, table = null) =>
  suggestCombos(hand, table).find((combo) => combo.count === count && combo.type === type);

check(types(cards('3S'))[0] === 'single', 'lẻ');
check(types(cards('3S', '3C')).includes('pair'), 'đôi');
check(types(cards('3S', '3C', '3D')).includes('triple'), 'sám');
check(types(cards('3S', '3C', '3D', '3H')).includes('four'), 'tứ quý');
check(types(cards('3S', '4C', '5D')).includes('straight'), 'sảnh ba lá');
check(types(cards('3S', '4C', '5D', '6H')).includes('straight'), 'sảnh bốn lá');
check(types(cards('3S', '3C', '4S', '4C', '5S', '5C')).includes('pairs_run'), 'ba đôi thông');
check(types(cards('3S', '3C', '4S', '4C', '5S', '5C', '6S', '6C')).includes('pairs_run'), 'bốn đôi thông');
check(!types(cards('12S', '13C', '14D', '2H'), null, cards('2H')[0]).includes('straight'), 'sảnh không chứa 2');
check(!types(cards('3S', '4C', '6D')).includes('straight'), 'sảnh phải liên tiếp');
check(!types(cards('3S', '3S')).includes('pair'), 'không lặp cùng lá');
check(!types(cards('2S', '2C', '3S', '3C', '4S', '4C')).includes('pairs_run'), 'đôi thông không chứa 2');
check(!types(cards('3S', '3C', '4S', '4C')).includes('pairs_run'), 'đôi thông tối thiểu ba đôi');
check(suggestCombos(cards('3S', '3S', '3C', '3D', '3H')).every((combo) =>
  new Set(combo.cards.map(cardKey)).size === combo.cards.length), 'bộ không chứa lá trùng');

const hand = cards('3S', '3C', '3D', '3H', '4S', '4C', '5S', '5C', '6S', '6C', '7S', '8C', '2H');
const lead = { combo: null, required: null, chopRules: rules };
const suggestions = suggestCombos(hand, lead);
const typeOrder = ['single', 'pair', 'triple', 'four', 'straight', 'pairs_run'];
check(suggestions.every((combo, index) => {
  if (!index) return true;
  const previous = suggestions[index - 1];
  return typeOrder.indexOf(previous.type) < typeOrder.indexOf(combo.type) ||
    (previous.type === combo.type && (previous.count < combo.count ||
      (previous.count === combo.count && previous.strength <= combo.strength)));
}), 'gợi ý được sắp thứ tự');
check(suggestions.some((combo) => combo.label === 'Sảnh 345'), 'nhãn sảnh ngắn');
check(suggestions.some((combo) => combo.label === 'Sảnh 3456'), 'nhãn sảnh dài');
check(suggestions.some((combo) => combo.label === 'Đôi thông 33-44-55'), 'nhãn đôi thông');
check(suggestCombos(hand, lead, cards('4S')[0]).every((combo) => combo.cards.some((card) => cardKey(card) === '4-spades')),
  'lọc theo lá được bấm');
check(suggestCombos(hand, lead, cards('9S')[0]).length === 0, 'lá không có trong tay');
const required = { ...lead, required: cards('3S')[0] };
check(suggestCombos(hand, required).every((combo) => combo.cards.some((card) => cardKey(card) === '3-spades')),
  'nước đầu phải có lá bắt buộc');
check(suggestCombos(hand, required, cards('2H')[0]).length === 0, 'lá bấm không bỏ qua lá bắt buộc');
check(comboWith(hand, 3, 'straight')?.cards.length === 3, 'liệt kê sảnh ngắn');
check(suggestions.some((combo) => combo.count === 4 && combo.type === 'straight'), 'liệt kê mọi độ dài sảnh');

const singleTwo = { type: 'single', count: 1, strength: 63, cards: cards('2H') };
const againstTwo = { combo: singleTwo, chopRules: rules };
const responses = suggestCombos(hand, againstTwo);
check(responses.every((combo) => combo.type === 'pairs_run' || combo.type === 'four'), 'chỉ giữ bộ đánh/chặt được');
check(responses.some((combo) => combo.type === 'pairs_run' && combo.count === 6 && combo.isChop), 'ba đôi thông chặt heo');
check(responses.some((combo) => combo.type === 'four' && combo.isChop), 'tứ quý chặt heo');
check(responses.some((combo) => combo.count === 8 && combo.isChop), 'bốn đôi thông chặt heo');
check(suggestCombos(hand, againstTwo, cards('4S')[0]).every((combo) =>
  combo.cards.some((card) => cardKey(card) === '4-spades')), 'lá chặt được lọc theo lá bấm');

const pairTwos = { type: 'pair', count: 2, strength: 60, cards: cards('2S', '2C') };
check(suggestCombos(hand, { combo: pairTwos, chopRules: rules }).some((combo) => combo.type === 'four'),
  'tứ quý chặt đôi heo');
const fourThrees = { type: 'four', count: 4, strength: 20, cards: cards('3S', '3C', '3D', '3H') };
check(suggestCombos(hand, { combo: fourThrees, chopRules: rules }).some((combo) => combo.count === 8 && combo.isChop),
  'bốn đôi thông chặt tứ quý');
check(!suggestCombos(hand, { combo: fourThrees, chopRules: { ...rules, pairs_run_4: [] } })
  .some((combo) => combo.count === 8), 'tuân theo ma trận chặt');
check(suggestCombos(hand, {
  combo: { type: 'single', count: 1, strength: 20, cards: cards('3S') }, chopRules: rules,
}).some((combo) => combo.type === 'single' && combo.strength > 20), 'cùng loại phải lớn hơn');
check(!suggestCombos(hand, {
  combo: { type: 'single', count: 1, strength: 63, cards: cards('2H') }, chopRules: {},
}).some((combo) => combo.type === 'single'), 'heo cùng loại phải lớn hơn');

console.log(`Trợ giúp Tiến Lên: ${checks} kiểm tra đạt.`);

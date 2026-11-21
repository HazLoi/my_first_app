import { describe, expect, it } from 'vitest';
import { isBinhLung, isValidArrangement, arrangementToHands, handsToArrangement } from './arrangement';
import { createDeck } from './cards';
import { dealHands, mulberry32, newSeed, seededUint32, shuffleWith, shuffleWithSeed } from './shuffle';
import { sha256Utf8, toHex } from './sha256';
import { detectWhite } from './white';
import { cards } from './testUtils';

describe('sha256 & shuffle có seed', () => {
  it('sha256 đúng vector chuẩn', () => {
    expect(toHex(sha256Utf8('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(sha256Utf8(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(sha256Utf8('a'.repeat(1000)))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('bộ bài đủ 52 lá, không trùng', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
  });

  it('cùng seed → cùng bộ bài; khác seed → khác', () => {
    const a = shuffleWithSeed('0123456789abcdef0123456789abcdef');
    const b = shuffleWithSeed('0123456789abcdef0123456789abcdef');
    const c = shuffleWithSeed('fedcba9876543210fedcba9876543210');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(52);
  });

  it('newSeed có 32 ký tự hex; seededUint32 xác định', () => {
    expect(newSeed()).toMatch(/^[0-9a-f]{32}$/);
    const first = seededUint32('abc');
    const second = seededUint32('abc');
    expect([first(), first()]).toEqual([second(), second()]);
  });

  it.each([2, 3, 4])('chia %i người: mỗi người 13 lá, không trùng', (players) => {
    const hands = dealHands(shuffleWithSeed(newSeed(mulberry32(players))), players);
    expect(hands).toHaveLength(players);
    const ids = hands.flatMap((hand) => hand.map((card) => card.id));
    expect(hands.every((hand) => hand.length === 13)).toBe(true);
    expect(new Set(ids).size).toBe(players * 13);
  });

  it('shuffleWith giữ nguyên tập phần tử', () => {
    const shuffled = shuffleWith([1, 2, 3, 4, 5], mulberry32(1));
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('xếp bài hợp lệ / binh lủng', () => {
  const hand = cards('2S 3H 7D 4S 5H 6D 9C 9D 9H KC KD AS AH');
  const ids = (spec: string): string[] => cards(spec).map((card) => card.id);

  it('chấp nhận xếp đúng', () => {
    const arrangement = {
      front: ids('2S 3H 7D'),
      middle: ids('4S 5H 6D KC KD'),
      back: ids('9C 9D 9H AS AH'),
    };
    const check = isValidArrangement(hand, arrangement);
    expect(check.valid).toBe(true);
    expect(isBinhLung(arrangementToHands(hand, arrangement))).toBe(false);
    expect(handsToArrangement(check.hands!)).toEqual(arrangement);
  });

  it('phát hiện binh lủng và chi bằng nhau thì không lủng', () => {
    const lung = {
      front: ids('9C 9D 9H'),
      middle: ids('4S 5H 6D KC KD'),
      back: ids('2S 3H 7D AS AH'),
    };
    const check = isValidArrangement(hand, lung);
    expect(check.valid).toBe(false);
    expect(check.message).toMatch(/Binh lủng/);
    expect(isBinhLung({ front: cards('AS KH 2D'), middle: cards('AD KC 3H 5S 9D'), back: cards('AH KS 4D 6C 10H') })).toBe(false);
  });

  it('từ chối sai số lá, lá trùng, lá lạ', () => {
    const base = { front: ids('2S 3H 7D'), middle: ids('4S 5H 6D KC KD'), back: ids('9C 9D 9H AS AH') };
    expect(isValidArrangement(hand, { ...base, front: ids('2S 3H') }).valid).toBe(false);
    expect(isValidArrangement(hand, { ...base, front: ids('2S 2S 7D') }).valid).toBe(false);
    expect(isValidArrangement(hand, { ...base, front: ids('2S 3H 8D') }).valid).toBe(false);
    expect(isValidArrangement(hand.slice(0, 12), base).valid).toBe(false);
  });
});

describe('detectWhite (tới trắng)', () => {
  const W: [string, string, string | null][] = [
    ['rồng cuốn', 'AS 2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS', 'rong_cuon'],
    ['sảnh rồng', 'AS 2H 3D 4C 5S 6H 7D 8C 9S 10H JD QC KS', 'sanh_rong'],
    ['13 lá cùng màu', 'AS 2C 3S 4C 5S 6C 7S 8C 9S 10C JS QC 2S', 'cung_mau_13'],
    ['13 lá đỏ', 'AH 2D 3H 4D 5H 6D 7H 8D 9H 10D JH QD 2H', 'cung_mau_13'],
    ['12 lá cùng màu', 'AS 2C 3S 4C 5S 6C 7S 8C 9S 10C JS QC 2H', 'cung_mau_12'],
    ['12 lá đỏ + 1 đen', 'AH 2D 3H 4D 5H 6D 7H 8D 9H 10D JH QD 2S', 'cung_mau_12'],
    ['6 đôi', 'AS AH 2S 2H 3S 3H 4S 4H 5S 5H 6S 6H 9D', 'sau_doi'],
    ['5 đôi + 1 sám', 'AS AH 2S 2H 3S 3H 4S 4H 5S 5H 6S 6H 6D', 'sau_doi'],
    ['tứ quý + 4 đôi', 'AS AH AD AC 2S 2H 3S 3H 4S 4H 5S 5H 9D', 'sau_doi'],
    ['3 sảnh', '3S 4H 5D 6S 7H 8D 9C 10S 4C 5H 6D 7C 8H', 'ba_sanh'],
    ['3 sảnh (A-2-3 chi 1)', 'AS 2H 3D 5S 6H 7D 8S 9H 10D JS QH KD AC', 'ba_sanh'],
    ['3 thùng 5-5-3', 'AS 3S 5S 7S 9S 2H 4H 6H 8H 10H 2D 4D 6D', 'ba_thung'],
    ['3 thùng 8-5', 'AS 3S 5S 7S 9S JS QS KS 2H 4H 6H 8H 3H', 'ba_thung'],
    ['3 thùng 10-3', 'AS 2S 3S 4S 6S 7S 8S 9S JS QS 2H 4H 6H', 'ba_thung'],
    ['bài thường', 'AS 2H 3D 5S 6H 8D 9S JH QD KC 4S 7H 2D', null],
    ['K-A-2 không phải sảnh', 'KS AH 2D 4S 5H 7D 8S 9H JD QS 3H 6C 2C', null],
  ];

  it.each(W)('%s', (_name, spec, expected) => {
    const hand = cards(spec);
    expect(hand).toHaveLength(13);
    expect(detectWhite(hand)).toBe(expected);
  });

  it('không nhận bộ khác 13 lá', () => {
    expect(detectWhite(cards('AS 2S 3S'))).toBeNull();
  });
});

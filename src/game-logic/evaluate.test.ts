import { describe, expect, it } from 'vitest';
import { compareHands, evaluateHand, handValue } from './evaluate';
import { cards } from './testUtils';

const EVALUATE_CASES: [string, number, string][] = [
  // Chi 1 (3 lá): chỉ Mậu thầu / Đôi / Sám cô
  ['AS KH 2D', 0, 'Mậu thầu A'],
  ['9S 4H 2D', 0, 'Mậu thầu 9'],
  ['QS JH 10D', 0, 'Mậu thầu Q'],
  ['2S 3H 4D', 0, 'Mậu thầu 4'],
  ['AS 2H 3D', 0, 'Mậu thầu A'],
  ['5S 5H 9D', 1, 'Đôi 5'],
  ['AS AH 2D', 1, 'Đôi A'],
  ['2S 2H KD', 1, 'Đôi 2'],
  ['KS 9H 9D', 1, 'Đôi 9'],
  ['7S 7H 7D', 3, 'Sám cô 7'],
  ['2S 2H 2D', 3, 'Sám cô 2'],
  ['AS AH AD', 3, 'Sám cô A'],
  ['2S 3S 4S', 0, 'Mậu thầu 4'],
  ['QS KS AS', 0, 'Mậu thầu A'],
  // Mậu thầu 5 lá
  ['AS KH 9D 5C 2H', 0, 'Mậu thầu A'],
  ['9S 7H 5D 4C 2H', 0, 'Mậu thầu 9'],
  ['KS QH JD 9C 8H', 0, 'Mậu thầu K'],
  ['AS KS QS JS 9S', 5, 'Thùng A'],
  // Đôi
  ['8S 8H AD KC 2H', 1, 'Đôi 8'],
  ['2S 2H AD KC QH', 1, 'Đôi 2'],
  ['AS AH KD QC JH', 1, 'Đôi A'],
  ['3S KH 3D 9C 5H', 1, 'Đôi 3'],
  // Hai đôi
  ['KS KH 5D 5C 2H', 2, 'Hai đôi K và 5'],
  ['2S 2H 3D 3C AH', 2, 'Hai đôi 3 và 2'],
  ['AS AH KD KC QH', 2, 'Hai đôi A và K'],
  ['9S 4H 9D 4C JH', 2, 'Hai đôi 9 và 4'],
  // Sám cô
  ['9S 9H 9D KC 2H', 3, 'Sám cô 9'],
  ['2S 2H 2D AC KH', 3, 'Sám cô 2'],
  ['AS AH AD KC QH', 3, 'Sám cô A'],
  ['5S KH 5D 5C 9H', 3, 'Sám cô 5'],
  // Sảnh
  ['AS 2H 3D 4C 5H', 4, 'Sảnh 5'],
  ['2S 3H 4D 5C 6H', 4, 'Sảnh 6'],
  ['10S JH QD KC AH', 4, 'Sảnh A'],
  ['9S 10H JD QC KH', 4, 'Sảnh K'],
  ['5S 6H 7D 8C 9H', 4, 'Sảnh 9'],
  ['KS AH 2D 3C 4H', 0, 'Mậu thầu A'],
  ['QS KH AD 2C 3H', 0, 'Mậu thầu A'],
  ['JS QH KD AC 2H', 0, 'Mậu thầu A'],
  // Thùng
  ['2S 5S 9S JS KS', 5, 'Thùng K'],
  ['2H 3H 4H 6H 7H', 5, 'Thùng 7'],
  ['AD 9D 7D 5D 3D', 5, 'Thùng A'],
  ['2C 3C 4C 5C 7C', 5, 'Thùng 7'],
  // Cù lũ
  ['7S 7H 7D 2C 2H', 6, 'Cù lũ 7'],
  ['2S 2H 2D 7C 7H', 6, 'Cù lũ 2'],
  ['KS KH KD AC AH', 6, 'Cù lũ K'],
  ['AS AH AD KC KH', 6, 'Cù lũ A'],
  // Tứ quý
  ['9S 9H 9D 9C 2H', 7, 'Tứ quý 9'],
  ['2S 2H 2D 2C AH', 7, 'Tứ quý 2'],
  ['AS AH AD AC KH', 7, 'Tứ quý A'],
  ['5S KH 5D 5C 5H', 7, 'Tứ quý 5'],
  // Thùng phá sảnh
  ['AS 2S 3S 4S 5S', 8, 'Thùng phá sảnh 5'],
  ['10H JH QH KH AH', 8, 'Thùng phá sảnh A'],
  ['5D 6D 7D 8D 9D', 8, 'Thùng phá sảnh 9'],
  ['2C 3C 4C 5C 6C', 8, 'Thùng phá sảnh 6'],
  ['9S 10S JS QS KS', 8, 'Thùng phá sảnh K'],
  // Không phải sảnh vòng
  ['QS KS AS 2S 3S', 5, 'Thùng A'],
  ['JD QD KD AD 2D', 5, 'Thùng A'],
];

describe('evaluateHand', () => {
  it.each(EVALUATE_CASES)('%s → loại %i, nhãn "%s"', (spec, category, label) => {
    const result = evaluateHand(cards(spec));
    expect(result.category).toBe(category);
    expect(result.label).toBe(label);
  });

  it('có đủ ít nhất 60 trường hợp bảng đánh giá + so sánh', () => {
    expect(EVALUATE_CASES.length + COMPARE_CASES.length).toBeGreaterThanOrEqual(60);
  });

  it('chỉ nhận 3 hoặc 5 lá', () => {
    expect(() => evaluateHand(cards('AS KH'))).toThrow();
    expect(() => evaluateHand(cards('AS KH 2D 3C'))).toThrow();
  });

  it('tieBreakers: đôi → đôi rồi kicker giảm dần; cù lũ theo bộ ba; thùng từ lá cao xuống', () => {
    expect(evaluateHand(cards('8S 8H AD KC 2H')).tieBreakers).toEqual([8, 14, 13, 2]);
    expect(evaluateHand(cards('7S 7H 7D 2C 2H')).tieBreakers).toEqual([7, 2]);
    expect(evaluateHand(cards('2S 5S 9S JS KS')).tieBreakers).toEqual([13, 11, 9, 5, 2]);
    expect(evaluateHand(cards('AS 2H 3D 4C 5H')).tieBreakers).toEqual([5]);
  });
});

// [a, b, kết quả so a với b]
const COMPARE_CASES: [string, string, -1 | 0 | 1][] = [
  ['AS 2H 3D 4C 5H', '2S 3H 4D 5C 6H', -1], // sảnh A-5 thấp nhất
  ['10S JH QD KC AH', '9S 10H JD QC KH', 1], // sảnh A-high lớn nhất
  ['10S JH QD KC AH', 'AS 2H 3D 4C 5H', 1],
  ['AS 2H 3D 4C 5H', '2S 2H 3D 3C AH', 1], // sảnh > hai đôi
  ['KS KH 5D 5C 2H', 'KD KC 5H 5S 3D', -1], // hai đôi cùng đôi cao, khác kicker
  ['KS KH 5D 5C 2H', 'KD KC 4H 4S AD', 1], // hai đôi cùng đôi cao, đôi thấp lớn hơn
  ['KS KH 5D 5C 2H', 'KD KC 5H 5S 2D', 0], // bằng hoàn toàn (khác chất) → hòa
  ['7S 7H 7D 2C 2H', '6S 6H 6D AC AH', 1], // cù lũ so theo bộ ba
  ['7S 7H 7D 3C 3H', '7C 7D 7H 2S 2D', 1], // cù lũ cùng bộ ba, đôi lớn hơn
  ['2S 5S 9S JS KS', '2H 5H 9H JH QH', 1], // thùng từ lá cao nhất
  ['2S 5S 9S JS KS', '3H 5H 9H JH KH', -1],
  ['AS KS 9S 5S 2S', 'AH KH 9H 5H 2H', 0],
  ['9S 9H 9D 9C 2H', '8S 8H 8D 8C AH', 1], // tứ quý
  ['9S 9H 9D 9C 2H', '9C 9D 9H 9S 3H', -1], // tứ quý, kicker
  ['AS 2S 3S 4S 5S', '9H 9D 9C 9S AH', 1], // thùng phá sảnh > tứ quý
  ['AS 2S 3S 4S 5S', '2D 3D 4D 5D 6D', -1],
  ['9S 10S JS QS KS', '10H JH QH KH AH', -1],
  ['AS KH 9D 5C 2H', 'AD KC 9H 5S 3D', -1], // mậu thầu, kicker cuối
  ['AS KH 9D 5C 2H', 'AD KC 9H 5S 2D', 0],
  ['9S 9H AD KC 2H', '9C 9D AS KH 3D', -1], // đôi giống nhau, kicker khác
  ['AS AH 2D', 'KS KH QD', 1], // chi 1: đôi
  ['5S 5H AD', '5C 5D KH', 1],
  ['7S 7H 7D', '6S 6H 6D', 1], // sám cô chi 1
  ['AS KH QD', 'AD KC JH', 1], // mậu thầu chi 1
  ['AS KH QD', 'AD KC QH', 0],
  ['2S 2H 2D', 'AS AH KD', 1], // sám cô > đôi
  ['9S 9H 9D KC 2H', '9C 9D 9H QS 3D', 1], // sám cô, kicker
  ['7S 7H 7D 2C 3H', '6S 6H 6D AC KH', 1],
  ['7S 7H 7D', '7S 7H 7D 2C 3H', -1], // chi 1 vs chi 2 cùng bộ ba: chi 1 yếu hơn (không lủng)
  ['AS KH QD', '2S 2H 3D 4C 6H', -1],
];

describe('compareHands', () => {
  it.each(COMPARE_CASES)('%s vs %s → %i', (a, b, expected) => {
    expect(compareHands(cards(a), cards(b))).toBe(expected);
    expect(compareHands(cards(b), cards(a))).toBe(-expected === 0 ? 0 : ((-expected) as -1 | 1));
  });
});

describe('handValue', () => {
  it('khớp thứ tự compareHands', () => {
    for (const [a, b, expected] of COMPARE_CASES) {
      const va = handValue(evaluateHand(cards(a)));
      const vb = handValue(evaluateHand(cards(b)));
      expect(Math.sign(va - vb)).toBe(expected);
    }
  });
});

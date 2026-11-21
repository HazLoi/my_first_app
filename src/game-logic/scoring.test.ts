import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareResults, settleChips } from './scoring';
import { createDeck } from './cards';
import { autoArrange, greedyArrange, suggestArrangements } from './suggest';
import { botArrange } from './bots';
import { isBinhLung, isValidArrangement } from './arrangement';
import { mulberry32, newSeed, shuffleWithSeed, dealHands, shuffleWith } from './shuffle';
import { cards } from './testUtils';
import type { Hands, ScoreInput } from './types';

const hands = (front: string, middle: string, back: string): Hands => ({
  front: cards(front),
  middle: cards(middle),
  back: cards(back),
});

// Các bộ bài không có tới trắng, đã xếp sẵn.
const STRONG = hands('AS AH 2D', '10S JH QD KC AH', 'AC AD KS KH KD'); // đôi A / sảnh A / cù lũ K (thắng cả 3)
const MID = hands('9S 9H 2C', '2S 2H 2D 5C 6H', '7S 7H 7D 8C 8H');
const WEAK = hands('3S 4H 6D', '5S 7H 9D JC KH', '2C 4C 6C 8C 10C');

const player = (id: string, h: Hands): ScoreInput => ({ id, name: id.toUpperCase(), hands: h });
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

describe('compareResults', () => {
  it('2 người: thắng cả 3 chi → sập hầm nhân đôi, không có sập làng', () => {
    const [a, b] = compareResults([player('a', STRONG), player('b', WEAK)]);
    // chi1 đôi A thắng mậu thầu: 1; chi2 sảnh thắng mậu thầu: 1; chi3 cù lũ K thắng thùng: 1 → 3 × 2
    expect(a!.points).toBe(6);
    expect(b!.points).toBe(-6);
    expect(a!.sapLang).toBe(false);
    expect(a!.pairs[0]).toMatchObject({ sapHam: true, multiplier: 2, sum: 3, total: 6 });
  });

  it('thưởng chi: sám cô chi 1 = 3, cù lũ chi 2 = 2, tứ quý chi 3 = 4', () => {
    const special = hands('7S 7H 7D', '2S 2H 2D 5C 5H', '9S 9H 9D 9C AH');
    const normal = hands('3S 4H 6D', '3C 4D 6H 8S 10D', '2C 4C 6C 8C 10C');
    const [a, b] = compareResults([player('a', special), player('b', normal)]);
    expect(a!.chi.front.points).toBe(3);
    expect(a!.chi.middle.points).toBe(2);
    expect(a!.chi.back.points).toBe(4);
    expect(a!.points).toBe(18); // (3 + 2 + 4) × 2 sập hầm
    expect(b!.points).toBe(-18);
  });

  it('bắt sập làng với 3 người: nhân đôi thêm cho mọi cặp', () => {
    const results = compareResults([player('a', STRONG), player('b', MID), player('c', WEAK)]);
    const a = results[0]!;
    expect(a.sapLang).toBe(true);
    expect(a.pairs.every((pair) => pair.multiplier === 4)).toBe(true);
    expect(sum(results.map((r) => r.points))).toBe(0);
  });

  it('bắt sập làng với 4 người', () => {
    const extra = hands('4S 5H 7D', '6S 8H 10D QC 2H', '3C 5C 9C JC KC');
    const results = compareResults([player('a', STRONG), player('b', MID), player('c', WEAK), player('d', extra)]);
    expect(results[0]!.sapLang).toBe(true);
    expect(results[0]!.pairs).toHaveLength(3);
    expect(sum(results.map((r) => r.points))).toBe(0);
  });

  it('hòa một chi thì không tính điểm chi đó', () => {
    const a = hands('3S 4H 6D', '5S 7H 9D JC KH', '2C 4C 6C 8C 10C');
    const b = hands('3C 4D 6H', '5C 7D 9H JD KS', '2D 4D 6D 8D 10D');
    const [ra, rb] = compareResults([player('a', a), player('b', b)]);
    expect(ra!.points).toBe(0);
    expect(rb!.points).toBe(0);
    expect(ra!.chi.front.label).toBe('Hòa');
  });

  it('tới trắng thắng người thường (không có sập hầm/sập làng), cân bằng tổng', () => {
    const white = hands('3S 4H 5D', '6S 7H 8D 9C 10S', '4C 5H 6D 7C 8H'); // ba sảnh
    const results = compareResults([player('w', white), player('x', STRONG), player('y', WEAK)]);
    const w = results[0]!;
    expect(w.white).toBe('ba_sanh');
    expect(w.whiteLabel).toBe('Ba sảnh');
    expect(w.points).toBe(20);
    expect(w.sapLang).toBe(false);
    expect(results[1]!.points).toBe(-4);
    expect(sum(results.map((r) => r.points))).toBe(0);
  });

  it('tới trắng vs tới trắng: rank cao thắng, bằng nhau hòa', () => {
    const dragon = hands('3S 4H 5D', '6S 7H 8D 9C 10S', '4C 5H 6D 7C 8H'); // ba sảnh (rank 2)
    const sixPairs = hands('AS AH 2D', '2S 3H 3D 4C 4H', '5S 5H 6D 6H 9C'); // 6 đôi (rank 3)
    const [a, b] = compareResults([player('a', dragon), player('b', sixPairs)]);
    expect(b!.white).toBe('sau_doi');
    expect(a!.points).toBe(-12);
    expect(b!.points).toBe(12);
    const twin = hands('3C 4D 5H', '6C 7D 8H 9S 10C', '4S 5S 6H 7S 8S');
    const tie = compareResults([player('a', dragon), player('b', twin)]);
    expect(tie.map((r) => r.points)).toEqual([0, 0]);
  });

  it('người thua chi cuối chịu điểm của bài đặc biệt người thắng', () => {
    const quads = hands('3S 4H 6D', '3C 4D 6H 8S 10D', '9S 9H 9D 9C AH');
    const flushy = hands('4C 5H 7D', '5S 6S 8S 9S JS', '10H JH QH KH AC');
    const [a, b] = compareResults([player('a', quads), player('b', flushy)]);
    expect(a!.chi.back.points).toBe(4);
    expect(a!.points + b!.points).toBe(0);
  });
});

describe('settleChips', () => {
  it('khi mọi người đủ xu: trả đúng điểm × cược', () => {
    expect(settleChips({ a: 300, b: -100, c: -200 }, { a: 1000, b: 1000, c: 1000 })).toEqual({ a: 300, b: -100, c: -200 });
  });

  it('người thua chỉ mất tối đa số dư, phần thiếu chia theo tỷ lệ', () => {
    const settled = settleChips({ a: 300, b: 100, c: -400 }, { a: 0, b: 0, c: 30 });
    expect(settled.c).toBe(-30);
    expect(sum(Object.values(settled))).toBe(0);
    expect(settled.a).toBe(23);
    expect(settled.b).toBe(7);
  });

  it('có thể tắt giới hạn theo số dư', () => {
    expect(settleChips({ a: 10, b: -10 }, { a: 0, b: 0 }, false)).toEqual({ a: 10, b: -10 });
  });

  it('property: luôn cân bằng và không ai thua quá số dư', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -500, max: 500 }), fc.integer({ min: 0, max: 800 })), { minLength: 2, maxLength: 4 }),
        (rows) => {
          const deltas: Record<string, number> = {};
          const balances: Record<string, number> = {};
          rows.forEach(([delta, balance], i) => {
            deltas[`p${i}`] = delta;
            balances[`p${i}`] = balance;
          });
          // Ép tổng điểm bằng 0 như một ván thật.
          deltas[`p${rows.length - 1}`] = -sum(rows.slice(0, -1).map(([delta]) => delta));
          const settled = settleChips(deltas, balances);
          expect(sum(Object.values(settled))).toBe(0);
          for (const [id, value] of Object.entries(settled)) {
            expect(value).toBeGreaterThanOrEqual(-(balances[id] as number));
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('suggestArrangements', () => {
  const deck = createDeck();
  const randomHand = (seed: number) => shuffleWith(deck, mulberry32(seed)).slice(0, 13);

  it('luôn có phương án không lủng, xếp giảm dần điểm đánh giá', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const hand = randomHand(seed);
      const options = suggestArrangements(hand, 5);
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(isBinhLung(option.hands)).toBe(false);
        expect(isValidArrangement(hand, option.arrangement).valid).toBe(true);
      }
      expect(autoArrange(hand).arrangement).toEqual(options[0]!.arrangement);
    }
  }, 30_000);

  it('các phương án khác nhau về giá trị chi (đa dạng)', () => {
    const hand = cards('AS AH 2D 2S 3C 3D 9H 9S KC KD 5H 6S 8C');
    const options = suggestArrangements(hand, 5);
    const signatures = new Set(options.map((o) => o.values.join('|')));
    expect(signatures.size).toBe(options.length);
    expect(options.length).toBeGreaterThan(1);
  });

  it('chạy dưới 100ms mỗi lần (sau khi khởi động)', () => {
    suggestArrangements(randomHand(1), 5);
    const times: number[] = [];
    for (let seed = 2; seed < 22; seed++) {
      const start = performance.now();
      suggestArrangements(randomHand(seed), 5);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.9)]!).toBeLessThan(100);
  });

  it('greedyArrange trả đủ 13 lá, không trùng', () => {
    const hand = randomHand(7);
    const arrangement = greedyArrange(hand);
    const ids = [...arrangement.front, ...arrangement.middle, ...arrangement.back].map((c) => c.id);
    expect(new Set(ids).size).toBe(13);
  });

  it('báo lỗi khi không đủ 13 lá', () => {
    expect(() => suggestArrangements(deck.slice(0, 12))).toThrow();
  });
});

describe('bots', () => {
  it.each(['easy', 'medium', 'hard'] as const)('bot %s luôn xếp hợp lệ', (level) => {
    for (let seed = 1; seed <= 6; seed++) {
      const hand = shuffleWith(createDeck(), mulberry32(seed * 31)).slice(0, 13);
      const arrangement = botArrange(hand, level, mulberry32(seed));
      expect(isValidArrangement(hand, arrangement).valid).toBe(true);
    }
  });
});

describe('property: tổng điểm toàn bàn = 0', () => {
  it('10.000 ván ngẫu nhiên với 2/3/4 người', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 4 }), fc.integer({ min: 0, max: 0xfffffff }), (count, seedNumber) => {
        const seed = newSeed(mulberry32(seedNumber));
        const dealt = dealHands(shuffleWithSeed(seed), count);
        const inputs: ScoreInput[] = dealt.map((hand, i) => {
          const h: Hands = { front: hand.slice(0, 3), middle: hand.slice(3, 8), back: hand.slice(8, 13) };
          return { id: `p${i}`, name: `P${i}`, hands: h };
        });
        const results = compareResults(inputs);
        expect(sum(results.map((r) => r.points))).toBe(0);
        expect(sum(results.map((r) => r.bonus))).toBe(0);
        for (const result of results) {
          expect(sum(result.pairs.map((pair) => pair.total))).toBe(result.points);
        }
      }),
      { numRuns: 10_000 },
    );
  }, 120_000);
});

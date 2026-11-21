import { createDeck } from './cards';
import { sha256Utf8 } from './sha256';
import type { Card } from './types';

export type Rng = () => number;

/** Seed hex 32 ký tự (128 bit), giống PHP: zingplayNewSeed(). */
export function newSeed(random: () => number = Math.random): string {
  let seed = '';
  for (let i = 0; i < 32; i++) seed += Math.floor(random() * 16).toString(16);
  return seed;
}

/** RNG xác định: u32 big-endian của 4 byte đầu sha256(seed ':' counter). */
export function seededUint32(seed: string): () => number {
  let counter = 0;
  return () => {
    const digest = sha256Utf8(`${seed}:${counter++}`);
    return (((digest[0] as number) << 24) | ((digest[1] as number) << 16) | ((digest[2] as number) << 8) | (digest[3] as number)) >>> 0;
  };
}

/** Fisher–Yates xác định theo seed — phải khớp zingplayShuffleWithSeed() bên PHP. */
export function shuffleWithSeed(seed: string, deck: Card[] = createDeck()): Card[] {
  const next = seededUint32(seed);
  const cards = deck.slice();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [cards[i], cards[j]] = [cards[j] as Card, cards[i] as Card];
  }
  return cards;
}

/** Người thứ i nhận deck[i*13 .. i*13+12]. */
export function dealHands(deck: Card[], playerCount: number): Card[][] {
  return Array.from({ length: playerCount }, (_, i) => deck.slice(i * 13, i * 13 + 13));
}

/** RNG nhanh cho bot/test (mulberry32), trả về [0,1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWith<T>(items: readonly T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

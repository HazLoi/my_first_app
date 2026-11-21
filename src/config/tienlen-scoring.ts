import type { TienLenScoringConfig } from '@/services/types';

export const TIENLEN_SCORING_DEFAULTS: TienLenScoringConfig = {
  rankPoints: { 2: [1, 0], 3: [2, 1, 0], 4: [3, 2, 1, 0] },
  chopValues: { black_two: -2, red_two: -4, four: -8, pairs_run_3: -6, pairs_run_4: -10 },
  chopperGains: true,
  chopOverMode: 'last-pays-all',
  coverShortfallByEarlierVictims: false,
  whiteEnabled: true,
  bonusPerOpponent: 2,
  whiteTypes: { dragon: true, four_twos: true, six_pairs: true, five_pairs_run: true, four_threes: true },
  coldEnabled: true,
  coldPenalty: -3,
  rottenEnabled: false,
};

export const TIENLEN_SCORING_DEFAULT_MODE: 'points' | 'coins' = 'points';
export const TIENLEN_SCORING_TARGETS = [10, 20, 30, 50] as const;
export const TIENLEN_SCORING_TARGET_MIN = 5;
export const TIENLEN_SCORING_TARGET_MAX = 200;
export const TIENLEN_SCORING_DEFAULT_TARGET = 20;
export const TIENLEN_SCORING_VALUE_MIN = -50;
export const TIENLEN_SCORING_VALUE_MAX = 50;
export const TIENLEN_SCORING_BONUS_MAX = 50;

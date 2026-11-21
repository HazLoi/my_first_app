import type { Combo, ChopRules, TienLenCard } from './tienlen';

export interface TienLenSuggestion extends Combo {
  label: string;
  isChop: boolean;
}

export interface TienLenSuggestTable {
  combo: Combo | null;
  required?: TienLenCard | null;
  chopRules?: ChopRules;
}

export function cardKey(card: TienLenCard): string;
export function suggestCombos(
  hand: TienLenCard[],
  table?: TienLenSuggestTable | null,
  tappedCard?: TienLenCard | null,
): TienLenSuggestion[];

import { PILES, type Pile, type PlayerScore } from '@/game-logic';
import { t } from '@/i18n';
import type { RoundResults } from '@/services/types';

export type EffectKind = 'white' | 'sapHam' | 'sapLang';

export interface EffectBanner {
  kind: EffectKind;
  title: string;
  sub: string;
}

const nameOf = (results: RoundResults, id: string): string => results.players.find((player) => player.id === id)?.name ?? '?';

/** Hiệu ứng đặc biệt có trong kết quả (lấy từ server): tới trắng, sập hầm, bắt sập làng. */
export function effectBanners(results: RoundResults | null, kinds: readonly EffectKind[] = ['white', 'sapHam', 'sapLang']): EffectBanner[] {
  if (!results) return [];
  const banners: EffectBanner[] = [];
  if (kinds.includes('white')) {
    for (const player of results.players) {
      if (!player.white) continue;
      banners.push({
        kind: 'white',
        title: t('table.banner.white', { label: player.whiteLabel ?? '' }),
        sub: t('table.banner.whiteSub', { winner: player.name }),
      });
    }
  }
  if (kinds.includes('sapHam')) {
    for (const player of results.players) {
      for (const pair of player.pairs) {
        if (pair.sapHam && pair.total > 0) {
          banners.push({
            kind: 'sapHam',
            title: t('table.banner.sapHam'),
            sub: t('table.banner.sapHamSub', { winner: player.name, loser: nameOf(results, pair.opponentId) }),
          });
        }
      }
    }
  }
  if (kinds.includes('sapLang')) {
    for (const player of results.players) {
      if (player.sapLang) {
        banners.push({ kind: 'sapLang', title: t('table.banner.sapLang'), sub: t('table.banner.sapLangSub', { winner: player.name }) });
      }
    }
  }
  return banners;
}

/** Xu của từng chi = điểm chi × mức cược (không gồm nhân sập hầm/sập làng/tới trắng). */
export function chiChips(player: PlayerScore, stake: number): Record<Pile, number> {
  return { front: player.chi.front.points * stake, middle: player.chi.middle.points * stake, back: player.chi.back.points * stake };
}

/** Tổng xu thực nhận/trả (server đã áp dụng giới hạn theo số dư); thiếu thì suy ra từ điểm. */
export const totalChips = (player: PlayerScore, stake: number): number => player.chips ?? player.points * stake;

/** Phần thưởng/nhân (sập hầm, sập làng, tới trắng) = tổng điểm − tổng các chi. */
export function bonusChips(player: PlayerScore, stake: number): number {
  const chi = chiChips(player, stake);
  return player.points * stake - PILES.reduce((sum, pile) => sum + chi[pile], 0);
}

/** Người thắng nhiều xu nhất (phải dương). Đồng hạng nhất thì không ai được vương miện. */
export function topWinnerId(results: RoundResults | null): string | null {
  if (!results) return null;
  let best: PlayerScore | null = null;
  let tie = false;
  for (const player of results.players) {
    const chips = totalChips(player, results.stake);
    if (chips <= 0) continue;
    if (!best || chips > totalChips(best, results.stake)) {
      best = player;
      tie = false;
    } else if (chips === totalChips(best, results.stake)) tie = true;
  }
  return best && !tie ? best.id : null;
}

export interface CoinTransfer {
  from: string;
  to: string;
  amount: number;
}

/** Các khoản chuyển xu giữa từng cặp (người thua → người thắng) để làm hiệu ứng xu bay. */
export function coinTransfers(results: RoundResults | null): CoinTransfer[] {
  if (!results) return [];
  const transfers: CoinTransfer[] = [];
  for (const player of results.players) {
    for (const pair of player.pairs) {
      if (pair.total > 0) transfers.push({ from: pair.opponentId, to: player.id, amount: pair.total * results.stake });
    }
  }
  return transfers;
}

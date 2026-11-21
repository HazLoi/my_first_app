import { RULES } from '@/config/rules';
import { compareEvaluated, evaluateHand } from './evaluate';
import { detectWhite } from './white';
import {
  CATEGORY_NAMES,
  PILES,
  type ChiOutcome,
  type ChiResult,
  type EvaluatedHand,
  type PairDetail,
  type Pile,
  type PlayerScore,
  type ScoreInput,
} from './types';

/** Điểm khi thắng một chi (1 hoặc nhiều hơn với bài đặc biệt) — khớp zingplayChiValue(). */
export function chiValue(pile: Pile, evaluation: EvaluatedHand): number {
  const name = CATEGORY_NAMES[evaluation.category] as string;
  return RULES.chiPoints[pile][name] ?? 1;
}

interface Pair {
  left: string;
  right: string;
  chi: Record<Pile, number>;
  sum: number;
  multiplier: number;
  leftWins: number;
  rightWins: number;
  white: boolean;
}

const whiteInfo = (key: string | null) =>
  key ? (RULES.white.types as Record<string, { rank: number; points: number; label: string }>)[key] : undefined;

interface Tally {
  wins: number;
  ties: number;
  losses: number;
  points: number;
  hand: string;
}

/**
 * Tính điểm theo cặp cho cả bàn (kể cả tới trắng, sập hầm, sập làng) — bản TypeScript của
 * zingplayCompareResults(). Chỉ dùng cho MockGateway/kiểm tra; ở chế độ polling kết quả lấy từ server.
 */
export function compareResults(players: ScoreInput[]): PlayerScore[] {
  const evaluations = new Map<string, Record<Pile, EvaluatedHand>>();
  const whites = new Map<string, string | null>();
  const tallies = new Map<string, Record<Pile, Tally>>();
  const totals = new Map<string, PlayerScore>();

  for (const player of players) {
    const evaluated = {
      front: evaluateHand(player.hands.front),
      middle: evaluateHand(player.hands.middle),
      back: evaluateHand(player.hands.back),
    };
    evaluations.set(player.id, evaluated);
    whites.set(player.id, detectWhite([...player.hands.front, ...player.hands.middle, ...player.hands.back]));
    const tally = {} as Record<Pile, Tally>;
    for (const pile of PILES) tally[pile] = { wins: 0, ties: 0, losses: 0, points: 0, hand: evaluated[pile].label };
    tallies.set(player.id, tally);
    const white = whites.get(player.id) ?? null;
    totals.set(player.id, {
      id: player.id,
      name: player.name,
      points: 0,
      bonus: 0,
      sapLang: false,
      white,
      whiteLabel: whiteInfo(white)?.label ?? null,
      hands: player.hands,
      chi: {} as Record<Pile, ChiResult>,
      pairs: [],
    });
  }

  const pairs: Pair[] = [];
  for (let l = 0; l < players.length; l++) {
    for (let r = l + 1; r < players.length; r++) {
      const left = players[l]!;
      const right = players[r]!;
      const pair: Pair = {
        left: left.id,
        right: right.id,
        chi: { front: 0, middle: 0, back: 0 },
        sum: 0,
        multiplier: 1,
        leftWins: 0,
        rightWins: 0,
        white: false,
      };
      const leftWhite = whiteInfo(whites.get(left.id) ?? null);
      const rightWhite = whiteInfo(whites.get(right.id) ?? null);
      if (leftWhite || rightWhite) {
        pair.white = true;
        const leftRank = leftWhite?.rank ?? 0;
        const rightRank = rightWhite?.rank ?? 0;
        if (leftRank > rightRank) pair.sum = (leftWhite as { points: number }).points;
        else if (rightRank > leftRank) pair.sum = -(rightWhite as { points: number }).points;
        pairs.push(pair);
        continue;
      }
      for (const pile of PILES) {
        const comparison = compareEvaluated(
          (evaluations.get(left.id) as Record<Pile, EvaluatedHand>)[pile],
          (evaluations.get(right.id) as Record<Pile, EvaluatedHand>)[pile],
        );
        const leftTally = (tallies.get(left.id) as Record<Pile, Tally>)[pile];
        const rightTally = (tallies.get(right.id) as Record<Pile, Tally>)[pile];
        let value = 0;
        if (comparison > 0) {
          value = chiValue(pile, (evaluations.get(left.id) as Record<Pile, EvaluatedHand>)[pile]);
          pair.leftWins++;
          leftTally.wins++;
          rightTally.losses++;
        } else if (comparison < 0) {
          value = -chiValue(pile, (evaluations.get(right.id) as Record<Pile, EvaluatedHand>)[pile]);
          pair.rightWins++;
          rightTally.wins++;
          leftTally.losses++;
        } else {
          leftTally.ties++;
          rightTally.ties++;
        }
        pair.chi[pile] = value;
        pair.sum += value;
      }
      if (pair.leftWins === 3 || pair.rightWins === 3) pair.multiplier = RULES.sapHamMultiplier;
      pairs.push(pair);
    }
  }

  // Sập làng: thắng sập hầm tất cả đối thủ (từ 3 người) thì mọi khoản của người đó nhân thêm.
  if (players.length >= RULES.sapLangMinPlayers) {
    for (const player of players) {
      const mine = pairs.filter((pair) => pair.left === player.id || pair.right === player.id);
      const swept = mine.every((pair) => (pair.left === player.id ? pair.leftWins : pair.rightWins) === 3);
      if (!swept) continue;
      (totals.get(player.id) as PlayerScore).sapLang = true;
      for (const pair of mine) pair.multiplier *= RULES.sapLangMultiplier;
    }
  }

  for (const pair of pairs) {
    const amount = pair.sum * pair.multiplier;
    const extra = amount - pair.sum;
    const left = totals.get(pair.left) as PlayerScore;
    const right = totals.get(pair.right) as PlayerScore;
    left.points += amount;
    right.points -= amount;
    left.bonus += extra;
    right.bonus -= extra;
    const sapHam = pair.leftWins === 3 || pair.rightWins === 3;
    const detail = (opponentId: string, sign: 1 | -1): PairDetail => ({
      opponentId,
      chi: { front: sign * pair.chi.front, middle: sign * pair.chi.middle, back: sign * pair.chi.back },
      sum: sign * pair.sum,
      multiplier: pair.multiplier,
      white: pair.white,
      sapHam: sapHam && !pair.white,
      total: sign * amount,
    });
    left.pairs.push(detail(pair.right, 1));
    right.pairs.push(detail(pair.left, -1));
    for (const pile of PILES) {
      (tallies.get(pair.left) as Record<Pile, Tally>)[pile].points += pair.chi[pile];
      (tallies.get(pair.right) as Record<Pile, Tally>)[pile].points -= pair.chi[pile];
    }
  }

  return players.map((player) => {
    const result = totals.get(player.id) as PlayerScore;
    const tally = tallies.get(player.id) as Record<Pile, Tally>;
    for (const pile of PILES) {
      const stats = tally[pile];
      let outcome: ChiOutcome = stats.wins > stats.losses ? 'win' : stats.losses > stats.wins ? 'loss' : 'tie';
      let label =
        stats.wins === stats.losses
          ? stats.wins === 0 && stats.ties > 0 ? 'Hòa' : 'Cân bằng'
          : stats.wins > stats.losses ? `Thắng ${stats.wins}` : `Thua ${stats.losses}`;
      if (result.white) {
        outcome = result.points > 0 ? 'win' : result.points < 0 ? 'loss' : 'tie';
        label = 'Tới trắng';
      }
      result.chi[pile] = { outcome, label, hand: stats.hand, points: stats.points };
    }
    return result;
  });
}

/** Người thua chỉ trả tối đa số dư; tiền thắng chia lại theo tỷ lệ để ván luôn cân bằng. */
export function settleChips(
  deltas: Record<string, number>,
  balances: Record<string, number>,
  capByBalance: boolean = RULES.capByBalance,
): Record<string, number> {
  if (!capByBalance) return { ...deltas };
  const settled: Record<string, number> = {};
  const gains: [string, number][] = [];
  let totalPaid = 0;
  let totalGain = 0;
  for (const [id, delta] of Object.entries(deltas)) {
    if (delta < 0) {
      const loss = Math.min(-delta, Math.max(0, balances[id] ?? 0));
      settled[id] = -loss;
      totalPaid += loss;
    } else if (delta > 0) {
      gains.push([id, delta]);
      totalGain += delta;
    } else {
      settled[id] = 0;
    }
  }
  if (totalPaid === totalGain) {
    for (const [id, gain] of gains) settled[id] = gain;
    return settled;
  }
  const remainders: [string, number][] = [];
  let remaining = totalPaid;
  for (const [id, gain] of gains) {
    const scaled = totalPaid * gain;
    settled[id] = Math.floor(scaled / totalGain);
    remainders.push([id, scaled % totalGain]);
    remaining -= settled[id] as number;
  }
  remainders.sort((a, b) => b[1] - a[1]);
  for (const [id] of remainders) {
    if (remaining <= 0) break;
    settled[id] = (settled[id] as number) + 1;
    remaining--;
  }
  return settled;
}

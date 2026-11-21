import { MIN_BALANCE_MULTIPLIER, STAKES } from '@/config/rules';
import type { TableSummary } from '@/services/types';

export type TableFilter = 'all' | 'open' | 'waiting';
export type TableKind = 'open' | 'playing' | 'high';

export const HIGH_STAKE = 500;
export const ROOM_CODE_LENGTH = 5;
export const PASSWORD_MAX = 32;
const QUICK_PLAY_MAX_STAKE = 200;

export const hasFreeSeat = (table: TableSummary): boolean => table.playerCount < table.maxPlayers;

/** Còn trống = còn chỗ; Chưa chơi = đang chờ (phase 'waiting'). */
export function filterTables(tables: readonly TableSummary[], filter: TableFilter): TableSummary[] {
  if (filter === 'open') return tables.filter(hasFreeSeat);
  if (filter === 'waiting') return tables.filter((table) => table.phase === 'waiting');
  return [...tables];
}

/** Loại icon bàn: xanh dương = cược cao, nâu = đang chơi/đầy, xanh lá = còn chỗ. */
export function tableKind(table: TableSummary): TableKind {
  if (table.stake >= HIGH_STAKE) return 'high';
  if (table.phase !== 'waiting' || !hasFreeSeat(table)) return 'playing';
  return 'open';
}

export const minBalanceFor = (stake: number): number => MIN_BALANCE_MULTIPLIER * stake;
export const canAfford = (balance: number, stake: number): boolean => balance >= minBalanceFor(stake);

/** Mức cược cao nhất (không vượt giới hạn chơi nhanh) mà số dư đủ; null nếu không đủ mức nào. */
export function quickPlayStake(balance: number): number | null {
  const stakes = STAKES.filter((stake) => stake <= QUICK_PLAY_MAX_STAKE && canAfford(balance, stake));
  return stakes.length ? Math.max(...stakes) : null;
}

/** Mã bàn: chữ in hoa A–Z và số 2–9, tối đa 5 ký tự. */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export const isValidRoomCode = (code: string): boolean => new RegExp(`^[A-Z2-9]{${ROOM_CODE_LENGTH}}$`).test(code);

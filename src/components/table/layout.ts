import type { Pile, ArrangementIds } from '@/game-logic';

export type SlotName = 'bottom' | 'left' | 'top' | 'right';

/** Kích thước lá bài trong thế giới 3D (đơn vị thế giới) và thông số bố cục hàng bài. */
export const CARD_WORLD = { w: 0.78, h: 1.09, thickness: 0.024 };
export const ROW_PITCH = 1.2;
export const COL_PITCH = 0.9;
export const TABLE_Y = 0;
export const CARD_REST_Y = TABLE_Y + CARD_WORLD.thickness / 2 + 0.004;

export const PILE_OFFSET: Record<Pile, number> = { front: 0, middle: 3, back: 8 };
export const PILE_ROW: Record<Pile, number> = { front: 0, middle: 1, back: 2 };
export const PILE_COUNT: Record<Pile, number> = { front: 3, middle: 5, back: 5 };

/** Thứ tự các chỗ ngồi quanh bàn (ngược chiều kim đồng hồ từ chỗ của bạn) theo số người. */
export function slotsFor(count: number): SlotName[] {
  if (count <= 2) return ['bottom', 'top'];
  if (count === 3) return ['bottom', 'left', 'right'];
  return ['bottom', 'left', 'top', 'right'];
}

export interface SeatAssignment<T> {
  slot: SlotName;
  /** null = ghế trống (chỉ hiện ở phase chờ). */
  player: T | null;
}

/**
 * Xếp người chơi vào chỗ ngồi: sắp theo `seat`, xoay vòng để `selfId` luôn ở dưới.
 * `seatCount` là số ghế hiển thị (≥ số người).
 */
export function assignSeats<T extends { id: string; seat: number }>(
  players: readonly T[],
  selfId: string,
  seatCount: number,
): SeatAssignment<T>[] {
  const count = Math.min(4, Math.max(2, seatCount, players.length));
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const selfIndex = sorted.findIndex((player) => player.id === selfId);
  const rotated = selfIndex > 0 ? [...sorted.slice(selfIndex), ...sorted.slice(0, selfIndex)] : sorted;
  return slotsFor(count).map((slot, index) => ({ slot, player: rotated[index] ?? null }));
}

/** Số ghế hiển thị: phase chờ dùng sức chứa của bàn; trong ván dùng số người thật (tối thiểu 2). */
export function seatCountFor(phase: string, maxPlayers: number, playerCount: number): number {
  const count = phase === 'waiting' ? Math.max(maxPlayers, playerCount) : playerCount;
  return Math.min(4, Math.max(2, count));
}

export interface SlotConfig {
  /** Tâm khối 13 lá (3 hàng) trên mặt bàn, tọa độ thế giới (x, z). */
  block: [number, number];
  scale: number;
  /** Nhãn tên bài nằm bên trái/phải khối bài. */
  labelSide: 'left' | 'right';
  /** Tâm avatar trong tọa độ thiết kế 1920×1080. */
  seat: { x: number; y: number };
  seatLayout: 'row' | 'column';
}

export const SLOT_CONFIG: Record<SlotName, SlotConfig> = {
  bottom: { block: [0, 2.85], scale: 0.98, labelSide: 'right', seat: { x: 230, y: 940 }, seatLayout: 'row' },
  top: { block: [0, -2.9], scale: 0.8, labelSide: 'right', seat: { x: 960, y: 128 }, seatLayout: 'row' },
  left: { block: [-5.5, 0.1], scale: 0.8, labelSide: 'right', seat: { x: 150, y: 430 }, seatLayout: 'column' },
  right: { block: [5.5, 0.1], scale: 0.8, labelSide: 'left', seat: { x: 1770, y: 430 }, seatLayout: 'column' },
};

export interface RowRect {
  /** Tâm hàng (thế giới), nửa rộng/nửa sâu. */
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

/** Vị trí lá bài thứ `index` của một chi trong khối bài ở chỗ `slot` (mặt bàn). */
export function cardRowPosition(slot: SlotName, pile: Pile, index: number): { x: number; z: number } {
  const config = SLOT_CONFIG[slot];
  const count = PILE_COUNT[pile];
  return {
    x: config.block[0] + (index - (count - 1) / 2) * COL_PITCH * config.scale,
    z: config.block[1] + (PILE_ROW[pile] - 1) * ROW_PITCH * config.scale,
  };
}

export function rowRect(slot: SlotName, pile: Pile): RowRect {
  const config = SLOT_CONFIG[slot];
  const count = PILE_COUNT[pile];
  const start = cardRowPosition(slot, pile, 0);
  return {
    x: config.block[0],
    z: start.z,
    halfW: ((count - 1) * COL_PITCH * config.scale + CARD_WORLD.w * config.scale) / 2 + 0.08,
    halfD: (CARD_WORLD.h * config.scale) / 2 + 0.08,
  };
}

/** Chỉ số lá (0..12) theo chi và vị trí trong chi — dùng làm khóa ổn định cho Card3D. */
export const handIndex = (pile: Pile, index: number): number => PILE_OFFSET[pile] + index;

/** Vị trí chồng/xòe bài trên tay (trước khi lật) của một chỗ ngồi. */
export function handPosition(slot: SlotName, index: number, self: boolean): { x: number; y: number; z: number; yaw: number; scale: number } {
  const config = SLOT_CONFIG[slot];
  if (self) {
    return { x: (index - 6) * 0.5, y: CARD_REST_Y + index * 0.026, z: 3.55, yaw: 0, scale: 1 };
  }
  return {
    x: config.block[0] + (index - 6) * 0.07,
    y: CARD_REST_Y + index * 0.026,
    z: config.block[1],
    yaw: (index - 6) * 0.018,
    scale: config.scale,
  };
}

export const DECK_POSITION = { x: 0, z: 0 };

/** Danh sách id theo chi → danh sách phẳng 13 lá theo thứ tự front, middle, back. */
export const flattenArrangement = (arrangement: ArrangementIds): string[] => [
  ...arrangement.front,
  ...arrangement.middle,
  ...arrangement.back,
];

import { PILE_SIZES, type Pile } from '@/game-logic';
import type { SlotRef } from './arrange';

/** Bố cục vùng xếp bài (tọa độ thiết kế 1920×1080). */
export const ARRANGE = {
  cardW: 104,
  cardH: 146,
  gap: 14,
  centerX: 960,
  rowY: { front: 222, middle: 380, back: 538 } as Record<Pile, number>,
  panelW: 640,
  panelPad: 14,
  trayY: 724,
  trayMaxW: 1120,
  trayStep: 86,
  trayPad: 22,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pileSlotRect(pile: Pile, index: number): Rect {
  const { cardW, cardH, gap, centerX, rowY } = ARRANGE;
  const size = PILE_SIZES[pile];
  const width = size * cardW + (size - 1) * gap;
  return { x: centerX - width / 2 + index * (cardW + gap), y: rowY[pile], w: cardW, h: cardH };
}

export function pilePanelRect(pile: Pile): Rect {
  const { cardH, centerX, rowY, panelW, panelPad } = ARRANGE;
  return { x: centerX - panelW / 2, y: rowY[pile] - panelPad, w: panelW, h: cardH + panelPad * 2 };
}

/** Khoảng cách giữa các lá trong khay (co lại để vừa 13 lá). */
export function trayStep(count: number): number {
  const { trayStep: step, trayMaxW, cardW } = ARRANGE;
  if (count <= 1) return step;
  return Math.min(step, (trayMaxW - cardW) / (count - 1));
}

export function trayCardRect(index: number, count: number): Rect {
  const { cardW, cardH, centerX, trayY } = ARRANGE;
  const step = trayStep(count);
  const width = (Math.max(count, 1) - 1) * step + cardW;
  return { x: centerX - width / 2 + index * step, y: trayY, w: cardW, h: cardH };
}

export function trayZoneRect(): Rect {
  const { centerX, trayY, trayMaxW, trayPad, cardH } = ARRANGE;
  return { x: centerX - trayMaxW / 2 - trayPad, y: trayY - trayPad, w: trayMaxW + trayPad * 2, h: cardH + trayPad * 2 };
}

export function slotRect(ref: SlotRef, trayCount: number): Rect {
  return ref.zone === 'tray' ? trayCardRect(ref.index, trayCount) : pileSlotRect(ref.zone, ref.index);
}

const inside = (rect: Rect, x: number, y: number, margin = 0): boolean =>
  x >= rect.x - margin && x <= rect.x + rect.w + margin && y >= rect.y - margin && y <= rect.y + rect.h + margin;

/**
 * Ô đích dưới con trỏ: ô của chi (gần nhất trong cùng hàng nếu thả lên khoảng trống của panel)
 * hoặc vị trí chèn vào khay. `trayCount` là số lá đang ở khay (đã trừ lá đang kéo nếu có).
 */
export function hitTest(x: number, y: number, trayCount: number): SlotRef | null {
  for (const pile of ['front', 'middle', 'back'] as const) {
    if (!inside(pilePanelRect(pile), x, y)) continue;
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < PILE_SIZES[pile]; index++) {
      const rect = pileSlotRect(pile, index);
      const distance = Math.abs(x - (rect.x + rect.w / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return { zone: pile, index: best };
  }
  if (inside(trayZoneRect(), x, y)) {
    const step = trayStep(trayCount + 1);
    const width = trayCount * step + ARRANGE.cardW;
    const left = ARRANGE.centerX - width / 2;
    const index = Math.round((x - ARRANGE.cardW / 2 - left) / step);
    return { zone: 'tray', index: Math.max(0, Math.min(trayCount, index)) };
  }
  return null;
}

/** Lá nằm trên cùng dưới con trỏ (lá vẽ sau nằm trên) trong trạng thái hiện tại. */
export function cardAtPoint(
  x: number,
  y: number,
  state: { front: (string | null)[]; middle: (string | null)[]; back: (string | null)[]; tray: string[] },
): string | null {
  for (let index = state.tray.length - 1; index >= 0; index--) {
    if (inside(trayCardRect(index, state.tray.length), x, y)) return state.tray[index] as string;
  }
  for (const pile of ['front', 'middle', 'back'] as const) {
    for (let index = 0; index < PILE_SIZES[pile]; index++) {
      const id = state[pile][index];
      if (id && inside(pileSlotRect(pile, index), x, y)) return id;
    }
  }
  return null;
}

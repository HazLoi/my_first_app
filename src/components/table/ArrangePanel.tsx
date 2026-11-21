import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PILES, type Card } from '@/game-logic';
import { useStage } from '@/components/Stage';
import { moveCard, swapCards, locate, type SlotRef } from './arrange';
import { ARRANGE, cardAtPoint, hitTest, slotRect, type Rect } from './arrangeLayout';
import { CardFace } from './CardFace';
import { ChiRow } from './ChiRow';
import type { ArrangeController } from './useArrange';
import { playSound } from '@/services/sound';

/** Vùng nhận con trỏ (tọa độ thiết kế) bao trọn 3 chi + khay. */
const AREA = { x: 320, y: 196, w: 1280, h: 730 };
const DRAG_THRESHOLD = 8;

interface Press {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Con trỏ lệch so với góc trên trái lá bài (để lá không "nhảy" về con trỏ). */
  offsetX: number;
  offsetY: number;
  dragging: boolean;
}

interface Drag {
  id: string;
  x: number;
  y: number;
  target: SlotRef | null;
}

/**
 * Bàn xếp bài của bạn: 3 chi (3/5/5) + khay. Hỗ trợ kéo–thả bằng Pointer Events (chuột + cảm ứng,
 * tọa độ chia cho scale của Stage) và chạm-để-chọn rồi chạm ô đích. Lá bài là phần tử tuyệt đối có
 * transition nên "snap" mượt khi đổi chỗ.
 */
export function ArrangePanel({ controller }: { controller: ArrangeController }) {
  const { state, cards, analysis, locked, foulPulse, setState } = controller;
  const { scale } = useStage();
  const rootRef = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const byId = new Map<string, Card>(cards.map((card) => [card.id, card]));
  const toDesign = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const s = scale || 1;
    return { x: AREA.x + (event.clientX - (rect?.left ?? 0)) / s, y: AREA.y + (event.clientY - (rect?.top ?? 0)) / s };
  };

  /** Trạng thái khay khi bỏ lá đang kéo ra — để tính vị trí chèn chính xác. */
  const trayWithout = (id: string): number => state.tray.filter((cardId) => cardId !== id).length;

  const applyMove = (id: string, target: SlotRef): void => {
    setState((previous) => moveCard(previous, id, target));
    playSound('click');
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const point = toDesign(event);
    const id = cardAtPoint(point.x, point.y, state);
    if (!id) {
      // Chạm vào ô trống/khay khi đang chọn một lá → đặt lá đó vào đây.
      if (selected) {
        const target = hitTest(point.x, point.y, trayWithout(selected));
        if (target) {
          applyMove(selected, target);
          setSelected(null);
        }
      }
      return;
    }
    const origin = locate(state, id);
    if (!origin) return;
    const rect = slotRect(origin, state.tray.length);
    press.current = {
      id,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      offsetX: point.x - rect.x,
      offsetY: point.y - rect.y,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = toDesign(event);
    if (!current.dragging && Math.hypot(point.x - current.startX, point.y - current.startY) < DRAG_THRESHOLD) return;
    current.dragging = true;
    const target = hitTest(point.x, point.y, trayWithout(current.id));
    setDrag({ id: current.id, x: point.x - current.offsetX, y: point.y - current.offsetY, target });
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
    if (cancelled) return;
    const point = toDesign(event);
    if (current.dragging) {
      const target = hitTest(point.x, point.y, trayWithout(current.id));
      if (target) applyMove(current.id, target);
      setSelected(null);
      return;
    }
    // Chạm (không kéo): chọn lá, bỏ chọn, hoặc đổi chỗ với lá đang chọn.
    if (selected === null) {
      setSelected(current.id);
      playSound('click');
    } else if (selected === current.id) {
      setSelected(null);
    } else {
      setState((previous) => swapCards(previous, selected, current.id));
      setSelected(null);
      playSound('click');
    }
  };

  const placed: { id: string; rect: Rect }[] = [];
  for (const pile of PILES) {
    state[pile].forEach((id, index) => {
      if (id) placed.push({ id, rect: slotRect({ zone: pile, index }, state.tray.length) });
    });
  }
  state.tray.forEach((id, index) => placed.push({ id, rect: slotRect({ zone: 'tray', index }, state.tray.length) }));

  const hotRef = drag?.target ?? null;

  return (
    <div
      ref={rootRef}
      className="hud-interactive arrange-area"
      style={{ left: AREA.x, top: AREA.y, width: AREA.w, height: AREA.h, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
    >
      {PILES.map((pile) => (
        <ChiRow
          key={pile}
          pile={pile}
          analysis={analysis.piles[pile]}
          dropIndex={hotRef && hotRef.zone === pile ? hotRef.index : null}
          foulPulse={foulPulse}
          origin={AREA}
          locked={locked}
        />
      ))}
      <div
        className={`arrange-tray ${hotRef?.zone === 'tray' ? 'arrange-tray-hot' : ''}`}
        style={{ left: ARRANGE.centerX - AREA.x - ARRANGE.trayMaxW / 2 - ARRANGE.trayPad, top: ARRANGE.trayY - AREA.y - ARRANGE.trayPad, width: ARRANGE.trayMaxW + ARRANGE.trayPad * 2, height: ARRANGE.cardH + ARRANGE.trayPad * 2 }}
      />
      {placed.map(({ id, rect }, order) => {
        const card = byId.get(id);
        if (!card) return null;
        const isDragged = drag?.id === id;
        const isSelected = selected === id;
        const x = isDragged ? drag.x : rect.x;
        const y = isDragged ? drag.y : rect.y;
        return (
          <div
            key={id}
            className={`arrange-card ${isDragged ? 'arrange-card-drag' : ''} ${isSelected ? 'arrange-card-selected' : ''}`}
            style={{
              width: ARRANGE.cardW,
              height: ARRANGE.cardH,
              zIndex: isDragged ? 100 : isSelected ? 50 : order + 1,
              transform: `translate(${x - AREA.x}px, ${y - AREA.y}px) ${isDragged ? 'scale(1.1) rotate(-2deg)' : ''}`,
              transition: isDragged ? 'none' : undefined,
            }}
          >
            <CardFace card={card} width={ARRANGE.cardW} />
          </div>
        );
      })}
    </div>
  );
}

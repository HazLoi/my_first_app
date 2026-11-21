import { PILES } from '@/game-logic';
import type { RoundResults } from '@/services/types';
import { useProjection } from './hooks';
import { CARD_REST_Y, rowRect, SLOT_CONFIG, type SlotName } from './layout';
import { PILE_NUMBER } from './tableView';

interface RevealOverlayProps {
  results: RoundResults;
  slotOf: Record<string, SlotName>;
  /** Chi đang hiện (0..3). */
  stage: number;
  /** Có người tới trắng: lật toàn bộ ngay. */
  anyWhite: boolean;
}

/** Tên bài từng người ở từng chi (chữ vàng viền đen, scale-in), ⭐ cho người thắng chi, mờ người thua. */
export function RevealOverlay({ results, slotOf, stage, anyWhite }: RevealOverlayProps) {
  const projection = useProjection();
  const visibleStage = anyWhite ? 3 : stage;
  return (
    <>
      {results.players.map((player) => {
        const slot = slotOf[player.id];
        if (!slot) return null;
        const config = SLOT_CONFIG[slot];
        return PILES.map((pile) => {
          if (visibleStage < PILE_NUMBER[pile]) return null;
          const rect = rowRect(slot, pile);
          const side = config.labelSide === 'right' ? 1 : -1;
          const point = projection.project(rect.x + side * (rect.halfW + 0.12), CARD_REST_Y, rect.z);
          const result = player.chi[pile];
          const size = Math.round(projection.scaleAt(rect.x, CARD_REST_Y, rect.z) * 0.34 * config.scale + 8);
          return (
            <div
              key={`${player.id}-${pile}`}
              className={`reveal-label ${result.outcome === 'loss' ? 'reveal-label-loss' : ''} ${result.outcome === 'win' ? 'reveal-label-win' : ''}`}
              style={{
                left: point.x,
                top: point.y,
                transform: `translate(${config.labelSide === 'right' ? '12px' : 'calc(-100% - 12px)'}, -50%)`,
                fontSize: Math.min(40, size),
              }}
            >
              {result.outcome === 'win' ? <span className="reveal-star">⭐</span> : null}
              <span className="text-outline">{result.hand}</span>
            </div>
          );
        });
      })}
    </>
  );
}

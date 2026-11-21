import type { Pile } from '@/game-logic';
import { PILE_SIZES } from '@/game-logic';
import { t } from '@/i18n';
import type { PileAnalysis } from './arrange';
import { ARRANGE, pilePanelRect, pileSlotRect } from './arrangeLayout';

interface ChiRowProps {
  pile: Pile;
  analysis: PileAnalysis;
  /** Chỉ số ô đang được highlight khi kéo/chạm (null = không). */
  dropIndex: number | null;
  /** Mỗi lần tăng, chi lủng chạy lại hiệu ứng rung. */
  foulPulse: number;
  /** Offset của vùng tương tác so với khung thiết kế. */
  origin: { x: number; y: number };
  locked: boolean;
}

const TITLE_KEY = { front: 'table.pile.front', middle: 'table.pile.middle', back: 'table.pile.back' } as const;

/** Một chi trên bàn xếp bài: khung, 3/5 ô thả, tên chi và nhãn loại bài thời gian thực (✓ hợp lệ / ✗ lủng). */
export function ChiRow({ pile, analysis, dropIndex, foulPulse, origin, locked }: ChiRowProps) {
  const panel = pilePanelRect(pile);
  const foul = analysis.status === 'foul';
  const statusClass = foul ? 'chi-foul' : analysis.status === 'ok' ? 'chi-ok' : '';
  return (
    <div
      key={foul ? `foul-${foulPulse}` : 'calm'}
      className={`chi-row ${statusClass} ${locked ? 'chi-locked' : ''}`}
      style={{ left: panel.x - origin.x, top: panel.y - origin.y, width: panel.w, height: panel.h }}
    >
      {Array.from({ length: PILE_SIZES[pile] }, (_, index) => {
        const slot = pileSlotRect(pile, index);
        return (
          <div
            key={index}
            className={`chi-slot ${dropIndex === index ? 'chi-slot-hot' : ''}`}
            style={{ left: slot.x - panel.x, top: slot.y - panel.y, width: slot.w, height: slot.h }}
          />
        );
      })}
      <div className="chi-title" style={{ right: panel.w + 16, top: ARRANGE.panelPad + 8 }}>
        <span>{t(TITLE_KEY[pile])}</span>
        <small>{t('table.chiCount', { count: analysis.count, size: analysis.size })}</small>
      </div>
      <div className={`chi-label ${statusClass}`} style={{ left: panel.w + 16, top: ARRANGE.panelPad + 8 }}>
        {analysis.label ? (
          <>
            <span aria-hidden="true">{foul ? '✗' : '✓'}</span>
            <b>{analysis.label}</b>
          </>
        ) : (
          <span className="chi-label-empty">…</span>
        )}
      </div>
    </div>
  );
}

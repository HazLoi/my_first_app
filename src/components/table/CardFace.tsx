import type { CSSProperties } from 'react';
import type { Card } from '@/game-logic';
import { CARD_ASPECT, cardBackUrl, cardSvgUrl } from './cardSvg';

interface CardFaceProps {
  card?: Card | null;
  width: number;
  className?: string;
  style?: CSSProperties;
}

/** Mặt bài (SVG tự vẽ, cùng nguồn `cardSvg` với texture 3D); không truyền `card` thì hiện lưng bài. */
export function CardFace({ card, width, className = '', style }: CardFaceProps) {
  return (
    <img
      src={card ? cardSvgUrl(card) : cardBackUrl()}
      alt={card ? `${card.label}${card.suit}` : ''}
      width={width}
      height={Math.round(width / CARD_ASPECT)}
      draggable={false}
      className={className}
      style={{ display: 'block', ...style }}
    />
  );
}

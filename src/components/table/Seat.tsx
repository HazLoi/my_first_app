import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { formatChips, formatSigned, t } from '@/i18n';
import type { Bubble } from '@/store/tableStore';
import type { Phase, TablePlayer } from '@/services/types';
import { CoinIcon, CrownIcon } from './icons';
import { useCountUp } from './hooks';
import { SLOT_CONFIG, type SlotName } from './layout';

interface SeatProps {
  slot: SlotName;
  /** null = ghế trống (chỉ hiện khi chờ người chơi). */
  player: TablePlayer | null;
  isSelf: boolean;
  isHost: boolean;
  phase: Phase;
  bubble?: Bubble;
  /** Số xu thắng/thua của ván (chỉ truyền ở phase summary). */
  delta?: number | null;
  /** Người thắng nhiều nhất ván. */
  winner?: boolean;
  round: number;
  /** Đang sáng viền (ví dụ người thắng chi hiện tại). */
  highlight?: boolean;
}

const BUBBLE_MS = 4500;

function SeatBubble({ bubble }: { bubble: Bubble }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble.at, bubble.text]);
  if (!visible) return null;
  return (
    <div className={`seat-bubble ${bubble.emoji ? 'seat-bubble-emoji' : ''}`} key={`${bubble.at}-${bubble.text}`}>
      {bubble.text}
    </div>
  );
}

/** Chỗ ngồi: avatar tròn viền vàng, tên, số xu (count-up), huy hiệu chủ bàn, trạng thái Xong/Chờ ván sau, chat, +/- xu. */
export function Seat({ slot, player, isSelf, isHost, phase, bubble, delta, winner = false, round, highlight = false }: SeatProps) {
  const config = SLOT_CONFIG[slot];
  const avatarSize = slot === 'bottom' ? 128 : 116;
  const balance = useCountUp(player?.balance ?? 0);
  const column = config.seatLayout === 'column';
  const style = { left: config.seat.x - avatarSize / 2, top: config.seat.y - avatarSize / 2, width: avatarSize, height: avatarSize };

  if (!player) {
    return (
      <div className="seat seat-empty" style={style}>
        <div className="seat-empty-ring" style={{ width: avatarSize, height: avatarSize }}>
          +
        </div>
        <div className="seat-info" style={column ? { top: avatarSize + 8, left: avatarSize / 2 - 110, width: 220, textAlign: 'center' } : { left: avatarSize + 16, top: avatarSize / 2 - 24 }}>
          <span className="seat-empty-text">{t('table.emptySeat')}</span>
        </div>
      </div>
    );
  }

  const inRound = phase !== 'waiting';
  const showDone = inRound && phase === 'arranging' && player.submitted && !player.spectator;
  const showWaitNext = player.spectator && inRound;
  const infoStyle = column
    ? { top: avatarSize + 10, left: avatarSize / 2 - 120, width: 240, alignItems: 'center', textAlign: 'center' as const }
    : { left: avatarSize + 16, top: avatarSize / 2 - 42, width: 300, alignItems: 'flex-start' };

  return (
    <div className={`seat seat-${slot} ${highlight ? 'seat-highlight' : ''} ${player.left ? 'seat-left' : ''}`} style={style} data-seat={slot}>
      {winner ? (
        <div className="seat-winner-crown" key={`w-${round}`}>
          <CrownIcon size={62} />
        </div>
      ) : null}
      <Avatar seed={player.id} avatar={player.avatar} size={avatarSize} dim={player.spectator || player.left} />
      {isHost ? (
        <span className="seat-host" title={t('table.host')} aria-label={t('table.host')}>
          <CrownIcon size={30} />
        </span>
      ) : null}
      {showDone ? <span className="seat-pill seat-pill-done">✓ {t('table.submitted')}</span> : null}
      {showWaitNext ? <span className="seat-pill seat-pill-wait">{t('table.spectator')}</span> : null}
      {player.left ? <span className="seat-pill seat-pill-wait">{t('table.left')}</span> : null}
      <div className="seat-info" style={{ ...infoStyle, display: 'flex', flexDirection: 'column' }}>
        <div className="seat-name">
          {player.name}
          {isSelf ? <em> ({t('common.you')})</em> : null}
        </div>
        <div className="seat-balance">
          <CoinIcon size={30} />
          <span>{formatChips(balance)}</span>
        </div>
      </div>
      {bubble ? <SeatBubble bubble={bubble} /> : null}
      {delta !== undefined && delta !== null && delta !== 0 ? (
        <div className={`seat-delta ${delta > 0 ? 'seat-delta-up' : 'seat-delta-down'}`} key={`d-${round}`}>
          {formatSigned(delta)}
        </div>
      ) : null}
    </div>
  );
}

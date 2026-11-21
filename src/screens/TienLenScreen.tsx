import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { Stage, useViewportMetrics } from '@/components/Stage';
import { CardFace } from '@/components/table/CardFace';
import { Seat } from '@/components/table/Seat';
import { assignSeats, seatCountFor, SLOT_CONFIG } from '@/components/table/layout';
import { rankLabel, type Card, type Suit } from '@/game-logic';
import { beats, cardKey, classify, playable, strength, type TienLenCard, type TienLenSuit } from '@/game-logic/tienlen';
import { useCountdown, useTable } from '@/hooks/useTable';
import { formatChips, formatSigned } from '@/i18n';
import { gateway } from '@/services';
import { playSound } from '@/services/sound';
import { useTableStore } from '@/store/tableStore';
import './table.css';
import './tienlen.css';

const symbols: Record<TienLenSuit, Suit> = { spades: '♠', clubs: '♣', diamonds: '♦', hearts: '♥' };
const face = (card: TienLenCard): Card => ({
  id: cardKey(card), value: card.rank, suit: symbols[card.suit], label: rankLabel(card.rank),
});
const places = ['NHẤT', 'NHÌ', 'BA', 'BÉT'];
const placeLabel = (index: number, count: number): string => index > 0 && index === count - 1 ? 'BÉT' : places[Math.min(index, 3)]!;

export function TienLenScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { scale } = useViewportMetrics();
  useTable(id?.toUpperCase());
  const table = useTableStore((state) => state.table);
  const closed = useTableStore((state) => state.closed);
  const status = useTableStore((state) => state.status);
  const data = table?.tienlen;
  const remaining = useCountdown(table?.phaseDeadline ?? null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBySet, setSortBySet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exit, setExit] = useState(false);
  const [optimistic, setOptimistic] = useState<TienLenCard[] | null>(null);
  const [banner, setBanner] = useState('');
  const [fly, setFly] = useState(false);
  const hintIndex = useRef(0);
  const drag = useRef<{ choosing: boolean; seen: Set<string> } | null>(null);
  const previous = useRef<{ version: number; turn: string | null; table: string; rank: number; events: string; round: number } | null>(null);

  const hand = useMemo(() => {
    const cards = [...(data?.cards ?? [])].sort((a, b) => strength(a) - strength(b));
    if (sortBySet) {
      const counts = new Map<number, number>();
      cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1));
      cards.sort((a, b) => (counts.get(b.rank)! - counts.get(a.rank)!) || strength(a) - strength(b));
    }
    return cards;
  }, [data?.cards, sortBySet]);
  const chosen = hand.filter((card) => selected.includes(cardKey(card)));
  const combo = classify(chosen);
  const myTurn = table?.phase === 'playing' && data?.turn === table.selfId;
  const reason = !myTurn ? 'Chưa đến lượt của bạn' : !combo ? 'Chọn bộ bài hợp lệ' :
    data?.required && !chosen.some((card) => cardKey(card) === cardKey(data.required!)) ? 'Phải chọn lá bắt buộc' :
    data?.table && !beats(combo, data.table, data.chopRules) ?
      (combo.type === data.table.type && combo.count === data.table.count ? 'Chưa đủ lớn' : 'Sai loại bộ hoặc không chặt được') : '';

  useEffect(() => {
    if (!table || !data) return;
    const last = previous.current;
    const tableKey = JSON.stringify(data.table);
    if (last && last.round === table.round && table.version > last.version) {
      if (data.turn === table.selfId && last.turn !== table.selfId) {
        playSound('tick');
        navigator.vibrate?.(80);
      }
      if (data.table && tableKey !== last.table) { setFly(true); window.setTimeout(() => setFly(false), 500); }
      const event = JSON.stringify(data.events) !== last.events ? data.events[data.events.length - 1] : undefined;
      if (event?.type === 'chop') setBanner('CHẶT!');
      else if (event?.type === 'white') setBanner('TỚI TRẮNG');
      else if (event?.type === 'cold') setBanner('CÓNG');
      else if (data.ranking.length > last.rank) setBanner(placeLabel(data.ranking.length - 1, table.players.filter((p) => !p.spectator).length));
      else if (table.phase === 'summary' && data.results?.players.some((player) => player.details.rotten !== 0)) setBanner('THỐI HEO');
    }
    if (last && last.round !== table.round && data.events.some((event) => event.type === 'white')) setBanner('TỚI TRẮNG');
    previous.current = { version: table.version, turn: data.turn, table: tableKey, rank: data.ranking.length, events: JSON.stringify(data.events), round: table.round };
    setSelected((current) => current.filter((key) => data.cards.some((card) => cardKey(card) === key)));
  }, [table, data]);
  useEffect(() => {
    if (!banner) return undefined;
    const timer = window.setTimeout(() => setBanner(''), 1800);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const perform = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kết nối được máy chủ.'); }
    finally { setBusy(false); setOptimistic(null); setFly(false); }
  };
  const toggle = (key: string, choosing: boolean) => setSelected((current) =>
    choosing ? current.includes(key) ? current : [...current, key] : current.filter((item) => item !== key));
  const seats = table ? assignSeats(table.players, table.selfId, seatCountFor(table.phase, table.maxPlayers, table.players.length)) : [];
  const currentCards = optimistic ?? data?.table?.cards ?? [];
  const currentName = optimistic ? table?.players.find((p) => p.id === table.selfId)?.name : table?.players.find((p) => p.id === data?.lastPlayer)?.name;
  const progress = data ? Math.max(0, Math.min(1, remaining / data.turnSeconds)) : 0;
  const touchSize = Math.max(80, 44 / Math.max(scale, 0.01));
  const cardWidth = Math.max(120, 44 / Math.max(scale, 0.01));

  return <Stage>
    <div className="tl-background" />
    {table && data ? <>
      <div className="table-header"><button className="btn table-header-button" onClick={() => setExit(true)}>Rời bàn</button></div>
      <div className="table-info glass"><strong>Tiến Lên · Bàn {table.code}</strong><span>Cược {formatChips(table.stake)}</span></div>
      {status !== 'online' ? <div className="table-connection">Mất kết nối – đang thử lại…</div> : null}
      {seats.map(({ slot, player }) => {
        const pos = SLOT_CONFIG[slot].seat;
        const place = player ? data.ranking.indexOf(player.id) : -1;
        return <div key={slot}>
          <Seat slot={slot} player={player} isSelf={player?.id === table.selfId} isHost={player?.id === table.hostId}
            phase={table.phase} round={table.round} highlight={player?.id === data.turn} />
          {player ? <div className="tl-seat-extra" style={{ left: pos.x, top: pos.y + 75 }}>
            {player.id === data.turn && table.phase === 'playing' ? <span className="tl-ring" style={{ background: `conic-gradient(#42d77d ${progress * 360}deg, #ffffff35 0)` }} /> : null}
            <span>🂠 {player.cardCount ?? 0}</span>{data.passed.includes(player.id) ? <span className="tl-passed">Bỏ lượt</span> : null}
            {place >= 0 ? <strong>{placeLabel(place, table.players.filter((p) => !p.spectator).length)}</strong> : null}
          </div> : null}
        </div>;
      })}
      {table.phase === 'waiting' ? <div className="tl-wait glass"><strong>Đang chờ người chơi ({table.players.length}/{table.maxPlayers})</strong>
        <span>{table.phaseDeadline ? `Bắt đầu sau ${Math.ceil(remaining)} giây` : 'Cần ít nhất 2 người'}</span>
        {table.hostId === table.selfId ? <button className="btn btn-green" disabled={busy || table.players.length < 2} onClick={() => void perform(() => gateway().startRound(table.code))}>Bắt đầu</button> : null}</div> : null}
      {table.phase === 'dealing' ? <div className="tl-message">Đang chia bài…</div> : null}
      {table.players.find((p) => p.id === table.selfId)?.spectator ? <div className="tl-message">Đang xem · Bạn sẽ vào ván tiếp theo</div> : null}
      {currentCards.length ? <div className={`tl-table-cards ${fly || optimistic ? 'tl-fly' : ''}`} key={`${data.lastPlayer}-${JSON.stringify(currentCards)}`}>
        <span>{currentName} đánh</span><div className="tl-card-row">{currentCards.map((card) => <CardFace key={cardKey(card)} card={face(card)} width={110} />)}</div>
      </div> : null}
      {table.phase === 'playing' ? <>
        <div className="tl-timer"><div style={{ width: `${progress * 100}%`, background: progress > .5 ? '#42d77d' : progress > .2 ? '#f5c451' : '#f04b49' }} /></div>
        <div className="tl-hand" style={{ bottom: touchSize + 12 }} onPointerMove={(event) => {
          if (!drag.current) return;
          const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tl-card]');
          const key = element?.dataset.tlCard;
          if (key && !drag.current.seen.has(key)) { drag.current.seen.add(key); toggle(key, drag.current.choosing); }
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          {hand.filter((card) => !optimistic?.some((item) => cardKey(item) === cardKey(card))).map((card, index) => {
            const key = cardKey(card);
            return <button key={key} type="button" className={`tl-hand-card ${selected.includes(key) ? 'selected' : ''}`}
              style={{ '--tl-tilt': `${(index - (hand.length - 1) / 2) * 1.1}deg`, marginLeft: index ? -cardWidth * .4 : 0 } as CSSProperties}
              data-tl-card={key} aria-label={`${face(card).label}${face(card).suit}`} aria-pressed={selected.includes(key)}
              onPointerDown={(event) => { event.preventDefault(); const choosing = !selected.includes(key); drag.current = { choosing, seen: new Set([key]) }; toggle(key, choosing); }}
              onClick={(event) => { if (event.detail === 0) toggle(key, !selected.includes(key)); }}>
              <CardFace card={face(card)} width={cardWidth} />
            </button>;
          })}
        </div>
        <div className="tl-actions" style={{ '--tl-touch': `${touchSize}px`, '--tl-font': `${Math.max(28, 14 / Math.max(scale, 0.01))}px` } as CSSProperties}>
          <button className="btn btn-green" disabled={busy || Boolean(reason)} onClick={() => { setOptimistic(chosen); setFly(true); void perform(async () => { await gateway().tienLenAction(table.code, { type: 'play', cards: chosen }); setSelected([]); setFly(false); }); }}>Đánh</button>
          <button className="btn" disabled={busy || !myTurn || !data.table} onClick={() => void perform(() => gateway().tienLenAction(table.code, { type: 'pass' }))}>Bỏ lượt</button>
          <button className="btn btn-orange" disabled={busy || !myTurn} onClick={() => {
            const choices = playable(hand, data.table, data.required, data.chopRules);
            if (!choices.length) { setError('Không có bài đánh'); return; }
            setError(''); setSelected(choices[hintIndex.current++ % choices.length]!.map(cardKey));
          }}>Gợi ý</button>
          <button className="btn" onClick={() => setSortBySet(!sortBySet)}>Xếp lại: {sortBySet ? 'theo bộ' : 'theo rank'}</button>
        </div>
        <div className="tl-reason" role={error ? 'alert' : 'status'} style={{ bottom: touchSize + 14 }}>{error || reason}</div>
      </> : error ? <div className="table-error" role="alert">{error}</div> : null}
      {banner ? <div className="tl-banner" role="status">{banner}</div> : null}
      {table.phase === 'summary' && data.results ? <div className="tl-summary glass">
        <strong>Tổng kết · Ván mới sau {Math.ceil(remaining)}…</strong>
        {data.results.players.map((player) => <div key={player.id}>
          <span>{player.place ? placeLabel(player.place - 1, data.results!.players.length) : '—'} · {player.name}</span><b>{formatSigned(player.chips)} xu</b>
          <small>Hạng {formatSigned(player.details.rank)} · Chặt {formatSigned(player.details.chop)} · Cóng {formatSigned(player.details.cold)} · Thối heo {formatSigned(player.details.rotten)} · Tới trắng {formatSigned(player.details.white)}</small>
        </div>)}
      </div> : null}
    </> : <div className="tl-message">Đang tải bàn…</div>}
    {closed ? <Modal title="Về sảnh"><p className="modal-text">{closed.message || 'Bạn không còn ở bàn.'}</p><button className="btn btn-gold table-modal-button" onClick={() => navigate('/lobby', { replace: true })}>Về sảnh</button></Modal> : null}
    {!closed && exit && table ? <Modal title="Rời bàn" onClose={() => setExit(false)}><p className="modal-text">Bạn có chắc muốn rời bàn? Trong ván bài sẽ được tự đánh.</p>{error ? <p className="modal-error">{error}</p> : null}<button className="btn btn-orange table-modal-button" disabled={busy} onClick={() => void perform(async () => { await gateway().leaveTable(table.code); navigate('/lobby', { replace: true }); })}>Rời bàn</button></Modal> : null}
  </Stage>;
}

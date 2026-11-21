import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { Stage, useViewportMetrics } from '@/components/Stage';
import { CardFace } from '@/components/table/CardFace';
import { useCountUp } from '@/components/table/hooks';
import { RoomChat } from '@/components/table/RoomChat';
import { Seat } from '@/components/table/Seat';
import { assignSeats, seatCountFor, SLOT_CONFIG } from '@/components/table/layout';
import { TIENLEN_ASSIST_CONFIG } from '@/config/tienlen-assist';
import { TIENLEN_SCORING_DEFAULTS, TIENLEN_SCORING_DEFAULT_TARGET } from '@/config/tienlen-scoring';
import { rankLabel, type Card, type Suit } from '@/game-logic';
import { beats, cardKey, classify, strength, type TienLenCard, type TienLenSuit } from '@/game-logic/tienlen';
import { suggestCombos } from '@/game-logic/tienlen-suggest.js';
import { useCountdown, useTable } from '@/hooks/useTable';
import { formatChips, formatSigned } from '@/i18n';
import { gateway } from '@/services';
import { playSound } from '@/services/sound';
import { useTableStore } from '@/store/tableStore';
import { useAuthStore } from '@/store/authStore';
import './table.css';
import './tienlen.css';

const symbols: Record<TienLenSuit, Suit> = { spades: '♠', clubs: '♣', diamonds: '♦', hearts: '♥' };
const face = (card: TienLenCard): Card => ({
  id: cardKey(card), value: card.rank, suit: symbols[card.suit], label: rankLabel(card.rank),
});
const places = ['NHẤT', 'NHÌ', 'BA', 'BÉT'];
const placeLabel = (index: number, count: number): string => index > 0 && index === count - 1 ? 'BÉT' : places[Math.min(index, 3)]!;

function AnimatedPoints({ value, signed = false }: { value: number; signed?: boolean }) {
  const shown = useCountUp(value);
  return <>{signed ? formatSigned(shown) : shown}</>;
}

export function TienLenScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { scale } = useViewportMetrics();
  useTable(id?.toUpperCase());
  const table = useTableStore((state) => state.table);
  const closed = useTableStore((state) => state.closed);
  const status = useTableStore((state) => state.status);
  const data = table?.tienlen;
  const userId = useAuthStore((state) => state.session?.user.id ?? '');
  const remaining = useCountdown(table?.phaseDeadline ?? null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBySet, setSortBySet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exit, setExit] = useState(false);
  const [optimistic, setOptimistic] = useState<TienLenCard[] | null>(null);
  const [banner, setBanner] = useState('');
  const [fly, setFly] = useState(false);
  const [smartHelp, setSmartHelp] = useState(() => localStorage.getItem('zp_tienlen_smart_help') !== 'false');
  const [selectionMode, setSelectionMode] = useState<'none' | 'suggested' | 'manual'>('none');
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [showScoringLaw, setShowScoringLaw] = useState(false);
  const [chopBadge, setChopBadge] = useState<{ from?: string; to?: string; version: number } | null>(null);
  const hintIndex = useRef(0);
  const doubleClick = useRef<{ key: string; index: number } | null>(null);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  const drag = useRef<{ choosing: boolean; key: string; before: string[]; seen: Set<string>; moved: boolean } | null>(null);
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
  const suggestions = useMemo(() => suggestCombos(hand, data ? {
    combo: data.table,
    required: data.required,
    chopRules: data.chopRules,
  } : null), [hand, data?.table, data?.required, data?.chopRules]);
  const suggestionIndex = useMemo(() => {
    const index = new Map<string, typeof suggestions>();
    for (const suggestion of suggestions) {
      for (const card of suggestion.cards) {
        const key = cardKey(card);
        index.set(key, [...(index.get(key) ?? []), suggestion]);
      }
    }
    return index;
  }, [suggestions]);
  const playableCardKeys = useMemo(() => new Set(suggestions.flatMap((suggestion) => suggestion.cards.map(cardKey))), [suggestions]);
  const chopCardKeys = useMemo(() => new Set(suggestions.filter((suggestion) => suggestion.isChop)
    .flatMap((suggestion) => suggestion.cards.map(cardKey))), [suggestions]);
  const tappedSuggestions = suggestedFor ? suggestionIndex.get(suggestedFor) ?? [] : [];
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
      if (event?.type === 'chop') {
        setBanner('CHẶT!');
        setChopBadge({ from: event.from, to: event.to, version: table.version });
      }
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
    if (!chopBadge) return undefined;
    const timer = window.setTimeout(() => setChopBadge(null), 1800);
    return () => window.clearTimeout(timer);
  }, [chopBadge]);
  useEffect(() => {
    if (!banner) return undefined;
    const timer = window.setTimeout(() => setBanner(''), 1800);
    return () => window.clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), TIENLEN_ASSIST_CONFIG.toastDurationMs);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const perform = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kết nối được máy chủ.'); }
    finally { setBusy(false); setOptimistic(null); setFly(false); }
  };
  const toggle = (key: string, choosing: boolean) => setSelected((current) =>
    choosing ? current.includes(key) ? current : [...current, key] : current.filter((item) => item !== key));
  const chooseCombo = (cards: TienLenCard[], tapped: string | null = null) => {
    setSelected(cards.map(cardKey));
    setSelectionMode('suggested');
    setSuggestedFor(tapped);
  };
  const toggleManually = (key: string) => {
    setSelectionMode('manual');
    setSuggestedFor(null);
    toggle(key, !selected.includes(key));
  };
  const selectCard = (key: string) => {
    if (smartHelp && myTurn && data?.table && !playableCardKeys.has(key)) {
      setToast('Lá này không đánh được');
      return;
    }
    setError('');
    if (!smartHelp || !myTurn || selectionMode === 'manual' || selected.includes(key)) {
      toggleManually(key);
      return;
    }
    const options = suggestionIndex.get(key) ?? [];
    if (data?.table) {
      if (!options.length) {
        setToast('Lá này không đánh được');
        return;
      }
      const smallest = [...options].sort((a, b) => a.count - b.count || a.strength - b.strength ||
        a.type.localeCompare(b.type))[0]!;
      chooseCombo(smallest.cards, key);
    } else {
      setSelected([key]);
      setSelectionMode('suggested');
      setSuggestedFor(key);
    }
  };
  const cycleDoubleClick = (key: string) => {
    if (!smartHelp || !myTurn || data?.table) return;
    const options = [...(suggestionIndex.get(key) ?? [])]
      .sort((a, b) => b.count - a.count || a.strength - b.strength || a.type.localeCompare(b.type));
    if (!options.length) return;
    const nextIndex = doubleClick.current?.key === key ? (doubleClick.current.index + 1) % options.length : 0;
    doubleClick.current = { key, index: nextIndex };
    chooseCombo(options[nextIndex]!.cards, key);
  };
  const chooseHint = () => {
    if (!suggestions.length) {
      setToast('Không có bài đánh');
      return;
    }
    const suggestion = suggestions[hintIndex.current++ % suggestions.length]!;
    chooseCombo(suggestion.cards, cardKey(suggestion.cards[0]!));
  };
  const seats = table ? assignSeats(table.players, table.selfId, seatCountFor(table.phase, table.maxPlayers, table.players.length)) : [];
  const currentCards = optimistic ?? data?.table?.cards ?? [];
  const currentName = optimistic ? table?.players.find((p) => p.id === table.selfId)?.name : table?.players.find((p) => p.id === data?.lastPlayer)?.name;
  const progress = data ? Math.max(0, Math.min(1, remaining / data.turnSeconds)) : 0;
  const touchSize = Math.max(80, 44 / Math.max(scale, 0.01));
  const cardWidth = Math.max(120, 44 / Math.max(scale, 0.01));

  return <Stage>
    <div className="tl-background" />
    {table && data ? <>
      <div className="table-header">
        <button className="btn table-header-button" onClick={() => setShowScoringLaw(true)}>Luật bàn</button>
        <button className="btn table-header-button" onClick={() => setExit(true)}>Rời bàn</button>
      </div>
      <div className="table-info glass"><strong>Tiến Lên · Bàn {table.code}</strong><span>Cược {formatChips(table.stake)}</span></div>
      <RoomChat messages={table.chatMessages ?? []} selfId={userId} onSend={(text) => gateway().sendChat(table.code, text)} />
      {data.scoringMode === 'points' ? <div className="tl-scoreboard glass">
        <strong>Điểm trận · Mục tiêu {data.targetScore ?? TIENLEN_SCORING_DEFAULT_TARGET}</strong>
        {(data.matchPlayers?.length ? data.matchPlayers : table.players.map((player) => ({
          id: player.id, name: player.name, left: player.left,
        }))).map((player) => {
          const result = data.results?.players.find((item) => item.id === player.id);
          const points = result?.matchPoints ?? data.matchTotals?.[player.id] ?? 0;
          const progress = Math.max(0, Math.min(100, ((points ?? 0) / (data.targetScore ?? TIENLEN_SCORING_DEFAULT_TARGET)) * 100));
          return <div key={player.id}><span>{player.name}{player.left ? ' (đã rời)' : ''}</span><b><AnimatedPoints value={points} /></b><i style={{ width: `${progress}%` }} /></div>;
        })}
      </div> : null}
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
          {player && chopBadge?.to === player.id
            ? <div key={chopBadge.version} className="tl-chop-badge" style={{ left: pos.x, top: pos.y - 95 }}>+ CHẶT</div> : null}
          {player && chopBadge?.from === player.id
            ? <div key={chopBadge.version} className="tl-chop-badge tl-chop-badge-negative" style={{ left: pos.x, top: pos.y - 95 }}>− CHẶT</div> : null}
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
          const gesture = drag.current;
          if (!gesture) return;
          if (!gesture.moved) {
            gesture.moved = true;
            setSelectionMode('manual');
            setSuggestedFor(null);
            setSelected(gesture.choosing
              ? gesture.before.includes(gesture.key) ? gesture.before :
                [...gesture.before, gesture.key]
              : gesture.before.filter((item) => item !== gesture.key));
          }
          const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tl-card]');
          const key = element?.dataset.tlCard;
          if (key && !gesture.seen.has(key)) { gesture.seen.add(key); toggle(key, gesture.choosing); }
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          {hand.filter((card) => !optimistic?.some((item) => cardKey(item) === cardKey(card))).map((card, index) => {
            const key = cardKey(card);
            const dimmed = smartHelp && myTurn && Boolean(data.table) && !playableCardKeys.has(key);
            return <button key={key} type="button" className={`tl-hand-card ${selected.includes(key) ? 'selected' : ''} ${dimmed ? 'unplayable' : ''} ${smartHelp && myTurn && chopCardKeys.has(key) ? 'choppable' : ''}`}
              style={{ '--tl-tilt': `${(index - (hand.length - 1) / 2) * 1.1}deg`, marginLeft: index ? -cardWidth * .4 : 0 } as CSSProperties}
              data-tl-card={key} aria-label={`${face(card).label}${face(card).suit}`} aria-pressed={selected.includes(key)}
              onPointerDown={(event) => {
                event.preventDefault();
                if (dimmed) { setToast('Lá này không đánh được'); return; }
                const choosing = !selected.includes(key);
                drag.current = { choosing, key, before: selected, seen: new Set([key]), moved: false };
                const now = Date.now();
                if (smartHelp && myTurn && !data.table && lastTap.current?.key === key &&
                    now - lastTap.current.at < TIENLEN_ASSIST_CONFIG.doubleTapWindowMs) {
                  lastTap.current = null;
                  cycleDoubleClick(key);
                } else {
                  lastTap.current = { key, at: now };
                  selectCard(key);
                }
              }}
              onClick={(event) => { if (event.detail === 0) selectCard(key); }}>
              <CardFace card={face(card)} width={cardWidth} />
            </button>;
          })}
        </div>
        {smartHelp && tappedSuggestions.length ? <div className="tl-suggestions" style={{ bottom: touchSize + cardWidth + 26 }}>
          {tappedSuggestions.map((suggestion) => <button key={`${suggestion.type}-${suggestion.count}-${suggestion.cards.map(cardKey).join(',')}`}
            type="button" className={suggestion.isChop ? 'tl-suggestion-chop' : ''}
            onClick={() => chooseCombo(suggestion.cards, suggestedFor)}>
            {suggestion.isChop ? 'CHẶT · ' : ''}{suggestion.label}
          </button>)}
        </div> : null}
        <div className="tl-actions" style={{ '--tl-touch': `${touchSize}px`, '--tl-font': `${Math.max(28, 14 / Math.max(scale, 0.01))}px` } as CSSProperties}>
          <button className="btn btn-green" disabled={busy || Boolean(reason)} onClick={() => { setOptimistic(chosen); setFly(true); void perform(async () => { await gateway().tienLenAction(table.code, { type: 'play', cards: chosen }); setSelected([]); setSelectionMode('none'); setSuggestedFor(null); setFly(false); }); }}>Đánh</button>
          <button className="btn" disabled={busy || !myTurn || !data.table} onClick={() => void perform(async () => { await gateway().tienLenAction(table.code, { type: 'pass' }); setSelected([]); setSelectionMode('none'); setSuggestedFor(null); })}>Bỏ lượt</button>
          <button className="btn btn-orange" disabled={busy || !myTurn} onClick={chooseHint}>Gợi ý</button>
          {selected.length ? <button className="btn" disabled={busy} onClick={() => {
            setSelected([]);
            setSelectionMode('none');
            setSuggestedFor(null);
          }}>Bỏ chọn</button> : null}
          <label className="tl-smart-toggle">
            <input type="checkbox" checked={smartHelp} onChange={(event) => {
              const enabled = event.target.checked;
              localStorage.setItem('zp_tienlen_smart_help', String(enabled));
              setSmartHelp(enabled);
              setSelectionMode('none');
              setSuggestedFor(null);
            }} />
            Trợ giúp chọn bài
          </label>
          <button className="btn" onClick={() => setSortBySet(!sortBySet)}>Xếp lại: {sortBySet ? 'theo bộ' : 'theo rank'}</button>
        </div>
        <div className="tl-reason" role={error ? 'alert' : 'status'} style={{ bottom: touchSize + 14 }}>{error || reason}</div>
        {toast ? <div className="tl-toast" role="status">{toast}</div> : null}
      </> : error ? <div className="table-error" role="alert">{error}</div> : null}
      {banner ? <div className="tl-banner" role="status">{banner}</div> : null}
      {table.phase === 'summary' && data.results ? <div className="tl-summary glass">
        <strong>Tổng kết · Ván mới sau {Math.ceil(remaining)}…</strong>
        {data.results.players.map((player) => <div key={player.id}>
          <span>{data.scoringMode === 'points' && data.matchEnded && player.matchPlace ? `Hạng ${player.matchPlace} · ` :
            player.place ? placeLabel(player.place - 1, data.results!.players.length) : '—'} · {player.name}{player.left ? ' (đã rời)' : ''}</span>
          {data.scoringMode === 'coins' ? <b>{formatSigned(player.chips)} xu</b> : null}
          {data.scoringMode === 'points' ? <b><AnimatedPoints value={player.roundPoints ?? 0} signed /> điểm ván · Tổng <AnimatedPoints value={player.matchPoints ?? 0} signed /></b> : null}
          <small>Hạng {formatSigned(player.details.rank)} · Chặt {formatSigned(player.details.chop)} · Cóng {formatSigned(player.details.cold)} · Thối heo {formatSigned(player.details.rotten)} · Tới trắng {formatSigned(player.details.white)}</small>
        </div>)}
        {data.results.chopChains?.map((chain, index) => {
          const last = chain.layers[chain.layers.length - 1]!;
          const name = (id: string) => data.results!.players.find((player) => player.id === id)?.name ?? id;
          const combo = last.combo.type === 'four' ? 'tứ quý' : last.combo.count === 6 ? 'ba đôi thông' : 'bốn đôi thông';
          const unit = data.scoringMode === 'coins' ? 'xu' : 'điểm';
          const transfers = chain.transfers.map((transfer) => transfer.credited
            ? `${name(transfer.from)} trả ${transfer.amount} ${unit} cho ${name(transfer.to)}`
            : `${name(transfer.from)} mất ${transfer.amount} ${unit}`).join('; ');
          const paid = new Set(chain.transfers.filter((transfer) => transfer.amount > 0).map((transfer) => transfer.from));
          const spared = chain.mode === 'last-pays-all' ? [...new Set(chain.layers.slice(0, -1).map((layer) => layer.from))]
            .filter((id) => !paid.has(id) && id !== last.to).map((id) => `${name(id)} không mất ${unit}`).join('; ') : '';
          return <div key={index}><small>{name(last.to)} {chain.layers.length > 1 ? 'chặt đè' : 'chặt'} {name(last.from)} ({combo}): {chain.units} đơn vị; {transfers}{spared ? `; ${spared}` : ''}</small></div>;
        })}
        {data.scoringMode === 'points' && data.results.players.some((player) => player.matchEnded) ? <strong>🏆 Kết thúc trận</strong> : null}
        {data.scoringMode === 'points' && data.results.players.some((player) => player.matchEnded)
          && table.hostId === table.selfId && table.players.filter((player) => !player.left).length >= 2
          ? <button className="btn btn-green" disabled={busy} onClick={() => void perform(() => gateway().startRound(table.code))}>Chơi trận mới</button>
          : null}
      </div> : null}
      {table.phase === 'summary' && data.scoringMode === 'points' && data.matchEnded && !data.results
        ? <div className="tl-summary glass">
          <strong>Trận đã dừng vì không đủ người</strong>
          {data.matchPlayers?.map((player) => <div key={player.id}>
            <span>{player.name}{player.left ? ' (đã rời)' : ''}</span>
            <b>Tổng {formatSigned(data.matchTotals?.[player.id] ?? 0)} điểm</b>
          </div>)}
        </div> : null}
    </> : <div className="tl-message">Đang tải bàn…</div>}
    {showScoringLaw ? <Modal title="Luật bàn" onClose={() => setShowScoringLaw(false)}>
      <div className="modal-text">
        <p><strong>Chế độ:</strong> {data?.scoringMode === 'coins' ? 'Tính xu' : 'Tính điểm'}</p>
        {data?.scoringMode === 'points' ? <>
          <p><strong>Điểm đích:</strong> {data.targetScore ?? TIENLEN_SCORING_DEFAULT_TARGET}</p>
          <p><strong>Điểm hạng:</strong> 2 người [{(data.scoringConfig?.rankPoints[2] ?? TIENLEN_SCORING_DEFAULTS.rankPoints[2]!).join(', ')}] · 3 người [{(data.scoringConfig?.rankPoints[3] ?? TIENLEN_SCORING_DEFAULTS.rankPoints[3]!).join(', ')}] · 4 người [{(data.scoringConfig?.rankPoints[4] ?? TIENLEN_SCORING_DEFAULTS.rankPoints[4]!).join(', ')}]</p>
          <p><strong>Điểm chặt:</strong> Heo đen {formatSigned(data.scoringConfig?.chopValues.black_two ?? TIENLEN_SCORING_DEFAULTS.chopValues.black_two)} · heo đỏ {formatSigned(data.scoringConfig?.chopValues.red_two ?? TIENLEN_SCORING_DEFAULTS.chopValues.red_two)} · ba đôi thông {formatSigned(data.scoringConfig?.chopValues.pairs_run_3 ?? TIENLEN_SCORING_DEFAULTS.chopValues.pairs_run_3)} · tứ quý {formatSigned(data.scoringConfig?.chopValues.four ?? TIENLEN_SCORING_DEFAULTS.chopValues.four)} · bốn đôi thông {formatSigned(data.scoringConfig?.chopValues.pairs_run_4 ?? TIENLEN_SCORING_DEFAULTS.chopValues.pairs_run_4)}</p>
          <p><strong>Người chặt:</strong> {data.scoringConfig?.chopperGains === false ? 'Không cộng điểm' : 'Được cộng số điểm người bị chặt bị trừ'}</p>
          <p><strong>Tới trắng:</strong> {data.scoringConfig?.whiteEnabled === false ? 'Tắt' : `Bật · +${data.scoringConfig?.bonusPerOpponent ?? TIENLEN_SCORING_DEFAULTS.bonusPerOpponent} mỗi đối thủ`} · {(['dragon', 'four_twos', 'six_pairs', 'five_pairs_run', 'four_threes'] as const)
            .filter((type) => data.scoringConfig?.whiteTypes[type])
            .map((type) => ({ dragon: 'Sảnh rồng', four_twos: 'Tứ quý 2', six_pairs: '6 đôi', five_pairs_run: '5 đôi thông', four_threes: 'Tứ quý 3' })[type]).join(', ') || 'Không có loại tới trắng'}
          </p>
          <p><strong>Cóng/ngộp:</strong> {data.scoringConfig?.coldEnabled === false ? 'Tắt' : `Bật · ${formatSigned(data.scoringConfig?.coldPenalty ?? TIENLEN_SCORING_DEFAULTS.coldPenalty)}`}</p>
          <p><strong>Thối heo:</strong> {data.scoringConfig?.rottenEnabled ? 'Bật theo giá heo' : 'Tắt'}</p>
          <p><strong>Cóng/ngộp:</strong> người còn nguyên 13 lá khi có người hết bài tự xếp hạng cuối và bị phạt.</p>
          <p><strong>Chặt đè:</strong> {data.scoringConfig?.chopOverMode === 'stack' ? 'Tính từng lớp.' : 'Người bị chặt cuối trả toàn bộ chuỗi cho người chặt cuối.'}</p>
          <p><strong>Tới trắng:</strong> kết thúc ván ngay khi chia bài và nhận điểm theo cấu hình bàn.</p>
          <p><strong>Thối heo:</strong> tính theo cấu hình bàn; người thối trả điểm cho người nhất.</p>
        </> : <p>Ván dùng cách tính xu hiện tại, không cộng dồn điểm trận.</p>}
      </div>
    </Modal> : null}
    {closed ? <Modal title="Về sảnh"><p className="modal-text">{closed.message || 'Bạn không còn ở bàn.'}</p><button className="btn btn-gold table-modal-button" onClick={() => navigate('/lobby', { replace: true })}>Về sảnh</button></Modal> : null}
    {!closed && exit && table ? <Modal title="Rời bàn" onClose={() => setExit(false)}><p className="modal-text">Bạn có chắc muốn rời bàn? Trong ván bài sẽ được tự đánh.</p>{error ? <p className="modal-error">{error}</p> : null}<button className="btn btn-orange table-modal-button" disabled={busy} onClick={() => void perform(async () => { await gateway().leaveTable(table.code); navigate('/lobby', { replace: true }); })}>Rời bàn</button></Modal> : null}
  </Stage>;
}

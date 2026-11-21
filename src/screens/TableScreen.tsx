import { Component, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Stage } from '@/components/Stage';
import { ArrangePanel } from '@/components/table/ArrangePanel';
import { CardFace } from '@/components/table/CardFace';
import { HudTimer } from '@/components/table/HudTimer';
import { RevealOverlay } from '@/components/table/RevealOverlay';
import { Seat } from '@/components/table/Seat';
import { flatProjection, perspectiveProjection, ProjectionContext, useRevealStage } from '@/components/table/hooks';
import { assignSeats, CARD_WORLD, seatCountFor, type SlotName } from '@/components/table/layout';
import { effectBanners, topWinnerId, totalChips } from '@/components/table/results';
import { buildCardSpecs, type CardSpec } from '@/components/table/tableView';
import { useArrange } from '@/components/table/useArrange';
import { PILES } from '@/game-logic';
import { useCountdown, useTable } from '@/hooks/useTable';
import { formatChips, formatSigned, t } from '@/i18n';
import { gateway } from '@/services';
import type { MatchHistoryEntry, RoundResults } from '@/services/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useTableStore } from '@/store/tableStore';
import './table.css';

const TableCanvas = lazy(() => import('@/three/TableCanvas'));

class CanvasFallback extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function FlatTable({ specs }: { specs: CardSpec[] }) {
  return (
    <div className="flat-table">
      <div className="flat-felt" />
      {specs.filter((spec) => !spec.hidden).map((spec) => {
        const point = flatProjection.project(spec.x, spec.y, spec.z);
        const width = CARD_WORLD.w * flatProjection.scaleAt(spec.x, spec.y, spec.z) * spec.scale;
        return (
          <div className="flat-card" key={spec.key} style={{ left: point.x, top: point.y, zIndex: Math.round(spec.y * 100) }}>
            <CardFace card={spec.faceUp ? spec.card : null} width={width} />
          </div>
        );
      })}
    </div>
  );
}

function ResultBoard({ results, onClose }: { results: RoundResults; onClose: () => void }) {
  const [detail, setDetail] = useState<string | null>(null);
  const selected = results.players.find((player) => player.id === detail);
  return (
    <Modal title={t('table.result.title', { round: results.round })} onClose={onClose} width={1300}>
      <p className="result-caption">{t('table.result.stake', { stake: formatChips(results.stake) })} · {t('table.result.detailHint')}</p>
      <div className="result-scroll">
        <table className="result-table">
          <thead><tr>
            <th>{t('table.result.player')}</th>
            {PILES.map((pile) => <th key={pile}>{t(`table.pile.${pile}`)}</th>)}
            <th>{t('table.result.points')}</th><th>{t('table.result.total')}</th>
          </tr></thead>
          <tbody>{results.players.map((player) => (
            <tr key={player.id}>
              <td><button className="result-name" onClick={() => setDetail(detail === player.id ? null : player.id)}>{player.name}</button></td>
              {PILES.map((pile) => <td key={pile}>{formatSigned(player.chi[pile].points)}</td>)}
              <td>{formatSigned(player.points)}</td>
              <td className={totalChips(player, results.stake) >= 0 ? 'result-positive' : 'result-negative'}>{formatSigned(totalChips(player, results.stake))}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="result-caption">{t('table.result.settlementNote')}</p>
      {selected ? (
        <div className="result-detail">
          <strong>{selected.name}{selected.whiteLabel ? ` · ${selected.whiteLabel}` : ''}</strong>
          {PILES.map((pile) => <div key={pile}>{t(`table.pile.${pile}`)}: {selected.chi[pile].hand}</div>)}
          {selected.pairs.map((pair) => (
            <div key={pair.opponentId}>
              {t('table.result.vs', { name: results.players.find((player) => player.id === pair.opponentId)?.name ?? '?' })}: {formatSigned(pair.total)} {t('table.result.points')}
              {pair.multiplier > 1 ? ` · ${t('table.result.multiplier', { value: pair.multiplier })}` : ''}
            </div>
          ))}
        </div>
      ) : null}
      <button className="btn btn-gold table-modal-button" onClick={onClose}>{t('table.result.close')}</button>
    </Modal>
  );
}

function History({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<MatchHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    gateway().history().then((items) => { if (active) setEntries(items); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : t('common.networkError')); });
    return () => { active = false; };
  }, []);
  return (
    <Modal title={t('table.history')} onClose={onClose} width={1000}>
      {error ? <p className="modal-error">{error}</p> : entries === null ? <p className="modal-text">{t('common.loading')}</p> :
        entries.length === 0 ? <p className="modal-text">{t('table.historyEmpty')}</p> :
          <div className="history-list">{entries.map((entry) => (
            <div key={entry.id}>
              <span>{t('table.historyRoom', { code: entry.roomCode })} · {t('table.historyPlayers', { count: entry.playerCount })}</span>
              <strong>{formatSigned(entry.points)} {t('table.result.points')}</strong>
            </div>
          ))}</div>}
    </Modal>
  );
}

export function TableScreen() {
  const { id } = useParams<{ id: string }>();
  const code = id?.toUpperCase();
  const navigate = useNavigate();
  useTable(code);
  const table = useTableStore((state) => state.table);
  const status = useTableStore((state) => state.status);
  const closed = useTableStore((state) => state.closed);
  const bubbles = useTableStore((state) => state.bubbles);
  const toasts = useTableStore((state) => state.toasts);
  const dismissToast = useTableStore((state) => state.dismissToast);
  const flat2D = useSettingsStore((state) => state.flat2D);
  const setFlat2D = useSettingsStore((state) => state.setFlat2D);
  const arrange = useArrange(table);
  const revealStage = useRevealStage(table);
  const remaining = useCountdown(table?.phaseDeadline ?? null);
  const [modal, setModal] = useState<'exit' | 'settings' | 'history' | 'results' | 'chat' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState('');
  const [hiddenResults, setHiddenResults] = useState<number | null>(null);
  const newestToast = toasts[toasts.length - 1];

  useEffect(() => {
    if (!newestToast) return undefined;
    const timer = window.setTimeout(() => dismissToast(newestToast.id), 3500);
    return () => window.clearTimeout(timer);
  }, [newestToast, dismissToast]);

  const seats = useMemo(() => table ? assignSeats(table.players, table.selfId, seatCountFor(table.phase, table.maxPlayers, table.players.length)) : [], [table]);
  const slotOf = useMemo(() => {
    const slots: Record<string, SlotName> = {};
    for (const seat of seats) if (seat.player) slots[seat.player.id] = seat.slot;
    return slots;
  }, [seats]);
  const cardView = table ? buildCardSpecs({
    phase: table.phase, round: table.round, elapsed: Math.max(0, (gateway().serverNow() - table.phaseStartedAt) / 1000),
    players: table.players, slotOf, selfId: table.selfId, cards: table.cards, arrangement: table.arrangement,
    results: table.results, stage: revealStage,
  }) : { specs: [], rowMarks: [] };
  const winner = topWinnerId(table?.results ?? null);
  const self = table?.players.find((player) => player.id === table.selfId);
  const showResults = Boolean(table?.results && (modal === 'results' || (modal === null && table.phase === 'summary' && hiddenResults !== table.round)));
  const showingReveal = table && ['revealing', 'scoring', 'summary'].includes(table.phase);

  const perform = async (action: () => Promise<unknown>, after?: () => void): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('common.networkError'));
    } finally {
      setBusy(false);
    }
  };
  const closeResults = (): void => {
    if (table) setHiddenResults(table.round);
    setModal(null);
  };

  return (
    <Stage canvas={!flat2D ? (
      <CanvasFallback onError={() => { setFlat2D(true); setError(t('table.graphicsFallback')); }}>
        <Suspense fallback={null}><TableCanvas specs={table?.phase === 'arranging' ? [] : cardView.specs} rowMarks={cardView.rowMarks} deckVisible={!table || table.phase === 'waiting' || table.phase === 'dealing'} /></Suspense>
      </CanvasFallback>
    ) : undefined}>
      {flat2D ? <FlatTable specs={table?.phase === 'arranging' ? [] : cardView.specs} /> : null}
      <ProjectionContext.Provider value={flat2D ? flatProjection : perspectiveProjection}>
        {table && showingReveal && table.results ? <RevealOverlay results={table.results} slotOf={slotOf} stage={revealStage} anyWhite={table.results.players.some((player) => Boolean(player.white))} /> : null}
      </ProjectionContext.Provider>
      {table ? (
        <>
          <div className="table-header">
            <button className="btn table-header-button" onClick={() => { setError(''); setModal('exit'); }}>{t('table.exit')}</button>
            <button className="btn table-header-button" onClick={() => setModal('settings')}>{t('common.settings')}</button>
            <button className="btn table-header-button" onClick={() => setModal('history')}>{t('table.history')}</button>
            {gateway().capabilities.chat ? <button className="btn table-header-button" onClick={() => { setError(''); setModal('chat'); }}>{t('table.chat')}</button> : null}
          </div>
          <div className="table-info glass">
            <strong>{t('table.code', { code: table.code })}</strong>
            <span>{t('table.stake', { stake: formatChips(table.stake) })}</span>
          </div>
          {status !== 'online' ? <div className="table-connection" role="status">{t(status === 'offline' ? 'table.offline' : 'table.reconnecting')}</div> : null}
          {seats.map(({ slot, player }) => (
            <Seat key={slot} slot={slot} player={player} isSelf={player?.id === table.selfId} isHost={player?.id === table.hostId}
              phase={table.phase} bubble={player ? bubbles[player.id] : undefined} round={table.round}
              winner={table.phase === 'summary' && player?.id === winner}
              delta={table.phase === 'summary' ? table.results?.players.find((result) => result.id === player?.id)?.chips : null} />
          ))}
          {table.phase === 'waiting' ? (
            <div className="table-waiting glass">
              <strong>{t('table.waiting', { count: table.players.filter((player) => !player.left).length, max: table.maxPlayers })}</strong>
              <span>{table.phaseDeadline ? t('table.autoStart', { seconds: Math.ceil(remaining) }) : t('table.waitingHint', { code: table.code })}</span>
              {self?.id === table.hostId ? (
                <button className="btn btn-green table-action-button" disabled={busy || table.players.filter((player) => !player.left).length < 2}
                  onClick={() => void perform(() => gateway().startRound(table.code))}>{t('table.start')}</button>
              ) : null}
              {table.cancelMessage ? <span>{table.cancelMessage}</span> : null}
            </div>
          ) : null}
          {table.phase === 'dealing' ? <div className="table-phase-message">{t('table.dealing')}</div> : null}
          {table.phase === 'arranging' && !self?.spectator && table.cards.length === 13 ? (
            <>
              <ArrangePanel controller={arrange} />
              <div className="table-arrange-title">{arrange.submitted ? t('table.submitted') : t('table.arrangeHint')}</div>
              <HudTimer startedAt={table.phaseStartedAt} deadline={table.phaseDeadline} />
              <div className="table-actions">
                <button className="btn table-action-button" disabled={arrange.locked || arrange.busy} onClick={arrange.reshuffle}>{t('table.shuffle')}</button>
                <button className="btn btn-orange table-action-button" disabled={arrange.locked || arrange.busy} onClick={arrange.hint}>{t('table.hint')}</button>
                <button className="btn btn-green table-action-button" disabled={arrange.locked || arrange.busy} onClick={arrange.done}>{t('table.done')}</button>
              </div>
              {arrange.notice ? <div className={`table-notice table-notice-${arrange.notice.tone}`} role="status">{arrange.notice.text}</div> : null}
            </>
          ) : null}
          {self?.spectator && table.phase !== 'waiting' ? <div className="table-phase-message">{t('table.spectatorHint')}</div> : null}
          {table.phase === 'scoring' && effectBanners(table.results).length > 0 ? (
            <div className="table-banner">{effectBanners(table.results).map((banner, index) => <div key={`${banner.kind}-${index}`}><strong>{banner.title}</strong><span>{banner.sub}</span></div>)}</div>
          ) : null}
          {table.phase === 'next' ? <div className="table-phase-message">{t('table.nextRound')} {Math.ceil(remaining)}</div> : null}
          {table.results && ['scoring', 'summary', 'next'].includes(table.phase) && !showResults ? <button className="btn btn-gold table-results-button" onClick={() => setModal('results')}>{t('table.results')}</button> : null}
        </>
      ) : <div className="table-phase-message">{t('table.loading')}</div>}
      {error && modal === null ? <div className="table-error" role="alert">{error}</div> : null}
      {newestToast ? <div className="table-toast" role="status">{newestToast.text}</div> : null}
      {closed ? (
        <Modal title={t('table.backToLobby')}>
          <p className="modal-text">{closed.message || t(`table.closed.${closed.reason}`)}</p>
          <button className="btn btn-gold table-modal-button" onClick={() => navigate('/lobby', { replace: true })}>{t('table.backToLobby')}</button>
        </Modal>
      ) : null}
      {!closed && modal === 'exit' && table ? (
        <Modal title={t('table.exit')} onClose={() => setModal(null)}>
          <p className="modal-text">{t(table.phase === 'dealing' || table.phase === 'arranging' ? 'table.exitConfirmPlaying' : 'table.exitConfirm')}</p>
          {error ? <p className="modal-error">{error}</p> : null}
          <div className="table-modal-actions">
            <button className="btn table-modal-button" onClick={() => setModal(null)}>{t('table.exitNo')}</button>
            <button className="btn btn-orange table-modal-button" disabled={busy} onClick={() => void perform(() => gateway().leaveTable(table.code), () => navigate('/lobby', { replace: true }))}>{t('table.exitYes')}</button>
          </div>
        </Modal>
      ) : null}
      {!closed && modal === 'settings' ? <SettingsPanel onClose={() => setModal(null)} /> : null}
      {!closed && modal === 'history' ? <History onClose={() => setModal(null)} /> : null}
      {!closed && modal === 'chat' && table ? (
        <Modal title={t('table.chat')} onClose={() => setModal(null)}>
          <form onSubmit={(event) => { event.preventDefault(); const text = chat.trim(); if (text) void perform(() => gateway().sendChat(table.code, text), () => { setChat(''); setModal(null); }); }}>
            <input className="modal-field" value={chat} onChange={(event) => setChat(event.target.value)} maxLength={80} placeholder={t('table.chatPlaceholder')} aria-label={t('table.chat')} />
            {error ? <p className="modal-error">{error}</p> : null}
            <button className="btn btn-gold table-modal-button" disabled={busy || !chat.trim()}>{t('table.chatSend')}</button>
          </form>
        </Modal>
      ) : null}
      {!closed && showResults && table?.results ? <ResultBoard results={table.results} onClose={closeResults} /> : null}
    </Stage>
  );
}

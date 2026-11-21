import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { formatChips, t } from '@/i18n';
import {
  canAfford,
  filterTables,
  hasFreeSeat,
  minBalanceFor,
  tableKind,
  type TableFilter,
} from '@/lib/lobbyLogic';
import { gateway } from '@/services';
import { playSound } from '@/services/sound';
import type { TableSummary } from '@/services/types';
import { QuickIcon, TableIcon } from './LobbyIcons';

const REFRESH_MS = 4000;
const FILTERS: Array<{ id: TableFilter; label: 'lobby.filterAll' | 'lobby.filterOpen' | 'lobby.filterWaiting' }> = [
  { id: 'all', label: 'lobby.filterAll' },
  { id: 'open', label: 'lobby.filterOpen' },
  { id: 'waiting', label: 'lobby.filterWaiting' },
];

interface TablePickerProps {
  balance: number;
  busy: boolean;
  onJoin(table: TableSummary): void;
  onCreate(): void;
  onQuickPlay(): void;
}

function TableTile({ table, balance, onJoin }: { table: TableSummary; balance: number; onJoin(table: TableSummary): void }) {
  const kind = tableKind(table);
  const full = !hasFreeSeat(table);
  const poor = !canAfford(balance, table.stake);
  const status = full ? t('lobby.statusFull') : table.phase !== 'waiting' ? t('lobby.statusPlaying') : t('lobby.statusOpen');
  return (
    <button
      type="button"
      className={`tp-tile tp-${kind} ${poor || full ? 'is-dim' : ''}`}
      onClick={() => onJoin(table)}
      aria-label={`${t('lobby.tableOf', { name: table.hostName })}, ${t('lobby.stakeLine', { stake: table.stake })}`}
    >
      <span className="tp-name">{t('lobby.tableOf', { name: table.hostName })}</span>
      <span className="tp-head">
        <span className="tp-iconcol">
          <span className="tp-icon">
            <TableIcon kind={kind} players={table.playerCount} maxPlayers={table.maxPlayers} />
          </span>
          <span className="tp-count">
            {table.hasPassword ? <span aria-hidden="true">🔒</span> : null}
            {table.playerCount}/{table.maxPlayers}
          </span>
        </span>
        <span className="tp-info">
          <span className="tp-stake">{t('lobby.stakeLine', { stake: formatChips(table.stake) })}</span>
          <span className={`tp-status ${poor ? 'is-poor' : ''}`}>
            {poor ? t('lobby.needCoinsShort', { amount: formatChips(minBalanceFor(table.stake)) }) : status}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Màn "Chọn bàn": tab lọc, lưới bàn cuộn ngang, tự làm mới định kỳ. */
export function TablePicker({ balance, busy, onJoin, onCreate, onQuickPlay }: TablePickerProps) {
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TableFilter>('all');
  const alive = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const list = await gateway().listTables();
      if (alive.current) {
        setTables(list);
        setFailed(false);
      }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      inFlight.current = false;
      if (alive.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onVisible = (): void => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Con lăn dọc của chuột cuộn lưới theo chiều ngang.
  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
  };

  const visible = tables ? filterTables(tables, filter) : [];

  return (
    <div className="tp-root">
      <div className="tp-left">
        <button type="button" className="tp-quick" disabled={busy} onClick={onQuickPlay}>
          <span className="tp-quick-bolt" aria-hidden="true"><QuickIcon /></span>
          <span>{t('lobby.quickPlayBig')}</span>
        </button>
      </div>
      <div className="tp-main">
        <div className="tp-tabs" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className="tp-tab"
              onClick={() => {
                playSound('click');
                setFilter(item.id);
              }}
            >
              {t(item.label)}
            </button>
          ))}
          <button
            type="button"
            className={`tp-refresh ${refreshing ? 'is-spinning' : ''}`}
            onClick={() => void load()}
            aria-label={t('lobby.refresh')}
            title={t('lobby.refresh')}
          >
            ⟳
          </button>
        </div>
        <div className="tp-grid hud-interactive" onWheel={onWheel}>
          <button type="button" className="tp-tile tp-create" onClick={onCreate}>
            <span className="tp-plus" aria-hidden="true">＋</span>
            <span className="tp-name">{t('lobby.createTable')}</span>
          </button>
          {visible.map((table) => (
            <TableTile key={table.code} table={table} balance={balance} onJoin={onJoin} />
          ))}
          {tables && visible.length === 0 ? <p className="tp-empty">{t('lobby.noTables')}</p> : null}
          {!tables ? (
            <p className="tp-empty">{failed ? t('lobby.loadFailed') : t('common.loading')}</p>
          ) : null}
        </div>
        {failed && tables ? <p className="tp-warn">{t('lobby.loadFailed')}</p> : null}
      </div>
    </div>
  );
}

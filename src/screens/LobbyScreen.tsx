import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LobbyCard } from '@/components/LobbyCard';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Stage } from '@/components/Stage';
import { ToastHost, useToasts } from '@/components/ToastHost';
import { CreateTableModal } from '@/components/lobby/CreateTableModal';
import { FriendIcon, OtherIcon, PickIcon, QuickIcon } from '@/components/lobby/LobbyIcons';
import { JoinFriendModal } from '@/components/lobby/JoinFriendModal';
import { LobbyBackground } from '@/components/lobby/LobbyBackground';
import { MatchHistory } from '@/components/lobby/MatchHistory';
import { PasswordModal } from '@/components/lobby/PasswordModal';
import { ProfilePill } from '@/components/lobby/ProfilePill';
import { SharedCodeModal } from '@/components/lobby/SharedCodeModal';
import { SideMenu } from '@/components/lobby/SideMenu';
import { TablePicker } from '@/components/lobby/TablePicker';
import { useLobbyActions } from '@/components/lobby/useLobbyActions';
import { hasFreeSeat } from '@/lib/lobbyLogic';
import { formatChips, t } from '@/i18n';
import { getGame, GAMES, readSelectedGame, saveSelectedGame, type GameId } from '@/config/games';
import { gateway } from '@/services';
import { playSound } from '@/services/sound';
import { GatewayError, type CreateTableOptions, type TableSummary } from '@/services/types';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import './lobby.css';

type View = 'hub' | 'home' | 'tables';
type ModalState =
  | { type: 'settings' }
  | { type: 'history' }
  | { type: 'friend' }
  | { type: 'create'; isPublic: boolean }
  | { type: 'password'; table: TableSummary }
  | { type: 'shared'; code: string }
  | null;

const TOP_UP_AMOUNT = 10_000;

export function LobbyScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((state) => state.session);
  const consumeAutoTopupNotice = useAuthStore((state) => state.consumeAutoTopupNotice);
  const logout = useAuthStore((state) => state.logout);
  const topUp = useAuthStore((state) => state.topUp);
  const soundOn = useSettingsStore((state) => state.soundOn);
  const setSoundOn = useSettingsStore((state) => state.setSoundOn);
  const { toasts, toast } = useToasts();
  const [gameType, setGameType] = useState<GameId>(readSelectedGame);
  const actions = useLobbyActions(toast, gameType);

  const [view, setView] = useState<View>('hub');
  const hubCards = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  useEffect(() => {
    if (view === 'hub' && hubCards.current) hubCards.current.scrollLeft = 0;
  }, [view]);

  // Thông báo từ màn bàn (ví dụ bị loại do hết xu) truyền qua location.state.notice.
  useEffect(() => {
    const notice = (location.state as { notice?: unknown } | null)?.notice;
    if (typeof notice === 'string' && notice) {
      toast(notice, 'info');
      navigate('/lobby', { replace: true, state: null });
    }
  }, [location.state, navigate, toast]);

  useEffect(() => {
    const amount = consumeAutoTopupNotice();
    if (amount !== null) toast(t('lobby.autoTopup', { amount: formatChips(amount) }), 'success');
  }, [consumeAutoTopupNotice, session?.user.autoTopupAmount, toast]);

  const user = session?.user;
  const balance = user?.balance ?? 0;
  const canTopUp = gateway().kind === 'mock';
  const currentGame = getGame(gameType);

  const chooseGame = (game: GameId): void => {
    const definition = getGame(game);
    if (!definition.enabled) return;
    if (game === 'tienlen' && gateway().kind === 'mock') {
      toast('Tiến Lên cần kết nối API PHP.', 'info');
      return;
    }
    saveSelectedGame(game);
    setGameType(game);
    setView('home');
  };

  const soon = useCallback(
    (name: string) => {
      playSound('click');
      toast(t('lobby.soonText', { name }), 'info');
    },
    [toast],
  );

  const handleTopUp = async (): Promise<void> => {
    if (topUpBusy) return;
    setTopUpBusy(true);
    try {
      await topUp(TOP_UP_AMOUNT);
      playSound('win');
      toast(t('lobby.topUpDone'), 'success');
    } catch (error) {
      toast(error instanceof GatewayError && error.message ? error.message : t('common.networkError'), 'error');
    } finally {
      setTopUpBusy(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    playSound('click');
    await logout();
    navigate('/auth', { replace: true });
  };

  const handleJoinTable = (table: TableSummary): void => {
    if (!actions.checkStake(table.stake)) return;
    if (!hasFreeSeat(table)) {
      toast(t('lobby.tableFull'), 'error');
      return;
    }
    if (table.hasPassword) setModal({ type: 'password', table });
    else void actions.join(table.code, undefined, table.stake);
  };

  const handleCreate = async (options: CreateTableOptions): Promise<void> => {
    const state = await actions.create(options);
    if (!state) return;
    if (options.isPublic) actions.enter(state.code);
    else setModal({ type: 'shared', code: state.code });
  };

  if (!user) return null;

  return (
    <Stage>
      <div className="lobby-root">
        <LobbyBackground />

        {view === 'hub' ? (
          <button type="button" className="btn lobby-top-btn" onClick={() => void handleLogout()}>
            <span aria-hidden="true">⎋</span> {t('lobby.logout')}
          </button>
        ) : (
          <>
            <button type="button" className="btn lobby-top-btn" onClick={() => setView('hub')}>
              <span aria-hidden="true">◀</span> {t('lobby.gameHub')}
            </button>
            <button type="button" className="btn lobby-logout-game" onClick={() => void handleLogout()}>
              <span aria-hidden="true">⎋</span> {t('lobby.logout')}
            </button>
          </>
        )}

        <h1 className={`lobby-title text-outline ${view === 'home' ? 'lobby-title-game' : ''}`}>
          {view === 'hub' ? t('lobby.gameHubTitle') : view === 'tables' ? t('lobby.tablesTitle') : currentGame.name}
        </h1>
        {view === 'tables' ? <span className="lobby-current-game">{currentGame.name}</span> : null}

        <ProfilePill user={user} onTopUp={canTopUp ? () => void handleTopUp() : undefined} topUpBusy={topUpBusy} />
        {(view === 'hub' || view === 'tables') && gateway().kind === 'polling' ? (
          <button type="button" className="btn lobby-history" onClick={() => setModal({ type: 'history' })}>Lịch sử</button>
        ) : null}

        {view === 'hub' ? (
          <div className="lobby-view" key="hub">
            <div className="lobby-cards game-hub-cards" ref={hubCards}>
              {GAMES.map((game, index) => (
                <LobbyCard
                  key={game.id}
                  theme={index === 0 ? 'green' : 'gold'}
                  title={game.name}
                  subtitle={game.enabled ? t('lobby.chooseGame') : t('lobby.soon')}
                  icon={<span className="game-hub-icon">{game.icon}</span>}
                  restTilt={index === 0 ? 3 : -3}
                  badge={game.enabled ? undefined : t('lobby.soon')}
                  disabled={!game.enabled}
                  onClick={() => chooseGame(game.id)}
                />
              ))}
            </div>
            <p className="lobby-note">{t('app.virtualCoins')}</p>
          </div>
        ) : view === 'home' ? (
          <div className="lobby-view" key="home">
            <SideMenu
              soundOn={soundOn}
              onFriends={() => soon(t('lobby.friends'))}
              onLeaderboard={() => soon(t('lobby.leaderboard'))}
              onGifts={() => soon(t('lobby.gifts'))}
              onToggleSound={() => {
                setSoundOn(!soundOn);
                if (!soundOn) window.setTimeout(() => playSound('click'), 0);
              }}
              onSettings={() => setModal({ type: 'settings' })}
            />
            <div className="lobby-cards">
              <LobbyCard
                theme="green"
                title={t('lobby.quick')}
                subtitle={t('lobby.quickSub')}
                icon={<QuickIcon />}
                restTilt={5}
                busy={actions.busy}
                onClick={() => void actions.quickPlay()}
              />
              <LobbyCard
                theme="gold"
                title={t('lobby.friend')}
                subtitle={t('lobby.friendSub')}
                icon={<FriendIcon />}
                restTilt={2}
                onClick={() => {
                  playSound('click');
                  setModal({ type: 'friend' });
                }}
              />
              <LobbyCard
                theme="red"
                title={t('lobby.pick')}
                subtitle={t('lobby.pickSub')}
                icon={<PickIcon />}
                restTilt={-2}
                onClick={() => {
                  playSound('click');
                  setView('tables');
                }}
              />
              <LobbyCard
                theme="violet"
                title={t('lobby.other')}
                subtitle={t('lobby.otherSub')}
                icon={<OtherIcon />}
                restTilt={-5}
                badge={t('lobby.soon')}
                onClick={() => soon(t('lobby.other'))}
              />
            </div>
            <p className="lobby-note">{t('app.virtualCoins')}</p>
          </div>
        ) : (
          <div className="lobby-view" key="tables">
            <TablePicker
              gameType={gameType}
              balance={balance}
              busy={actions.busy}
              onJoin={handleJoinTable}
              onCreate={() => {
                playSound('click');
                setModal({ type: 'create', isPublic: true });
              }}
              onQuickPlay={() => void actions.quickPlay()}
            />
          </div>
        )}

        {view !== 'hub' && actions.hasCurrentTable ? (
          <button type="button" className={`btn btn-gold lobby-return-table lobby-return-table-${view}`}
            disabled={actions.busy} onClick={() => void actions.returnToTable()}>
            {t('lobby.returnToTable')}
          </button>
        ) : null}

        {modal?.type === 'settings' ? <SettingsPanel onClose={() => setModal(null)} /> : null}
        {modal?.type === 'history' && session ? <MatchHistory token={session.token} onClose={() => setModal(null)} /> : null}
        {modal?.type === 'friend' ? (
          <JoinFriendModal
            busy={actions.busy}
            onClose={() => setModal(null)}
            onJoin={(code, password) => void actions.join(code, password)}
            onCreatePrivate={() => setModal({ type: 'create', isPublic: false })}
            onReturnToTable={() => void actions.returnToTable()}
          />
        ) : null}
        {modal?.type === 'create' ? (
          <CreateTableModal
            balance={balance}
            gameType={gameType}
            initialPublic={modal.isPublic}
            busy={actions.busy}
            onClose={() => setModal(null)}
            onSubmit={(options) => void handleCreate(options)}
            onReturnToTable={() => void actions.returnToTable()}
          />
        ) : null}
        {modal?.type === 'password' ? (
          <PasswordModal
            busy={actions.busy}
            onClose={() => setModal(null)}
            onSubmit={(password) => void actions.join(modal.table.code, password, modal.table.stake)}
            onReturnToTable={() => void actions.returnToTable()}
          />
        ) : null}
        {modal?.type === 'shared' ? (
          <SharedCodeModal code={modal.code} onEnter={() => actions.enter(modal.code)} />
        ) : null}

        <ToastHost toasts={toasts} />
      </div>
    </Stage>
  );
}

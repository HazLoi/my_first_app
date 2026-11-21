import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LobbyCard } from '@/components/LobbyCard';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Stage } from '@/components/Stage';
import { ToastHost, useToasts } from '@/components/ToastHost';
import { CreateTableModal } from '@/components/lobby/CreateTableModal';
import { FriendIcon, OtherIcon, PickIcon, QuickIcon } from '@/components/lobby/LobbyIcons';
import { JoinFriendModal } from '@/components/lobby/JoinFriendModal';
import { LobbyBackground } from '@/components/lobby/LobbyBackground';
import { PasswordModal } from '@/components/lobby/PasswordModal';
import { ProfilePill } from '@/components/lobby/ProfilePill';
import { SharedCodeModal } from '@/components/lobby/SharedCodeModal';
import { SideMenu } from '@/components/lobby/SideMenu';
import { TablePicker } from '@/components/lobby/TablePicker';
import { useLobbyActions } from '@/components/lobby/useLobbyActions';
import { hasFreeSeat } from '@/lib/lobbyLogic';
import { t } from '@/i18n';
import { gateway } from '@/services';
import { playSound } from '@/services/sound';
import { GatewayError, type CreateTableOptions, type TableSummary } from '@/services/types';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import './lobby.css';

type View = 'home' | 'tables';
type ModalState =
  | { type: 'settings' }
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
  const logout = useAuthStore((state) => state.logout);
  const topUp = useAuthStore((state) => state.topUp);
  const soundOn = useSettingsStore((state) => state.soundOn);
  const setSoundOn = useSettingsStore((state) => state.setSoundOn);
  const { toasts, toast } = useToasts();
  const actions = useLobbyActions(toast);

  const [view, setView] = useState<View>('home');
  const [modal, setModal] = useState<ModalState>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);

  // Thông báo từ màn bàn (ví dụ bị loại do hết xu) truyền qua location.state.notice.
  useEffect(() => {
    const notice = (location.state as { notice?: unknown } | null)?.notice;
    if (typeof notice === 'string' && notice) {
      toast(notice, 'info');
      navigate('/lobby', { replace: true, state: null });
    }
  }, [location.state, navigate, toast]);

  const user = session?.user;
  const balance = user?.balance ?? 0;
  const canTopUp = gateway().kind === 'mock';

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

        {view === 'tables' ? (
          <button type="button" className="btn lobby-top-btn" onClick={() => setView('home')}>
            <span aria-hidden="true">◀</span> {t('lobby.back')}
          </button>
        ) : (
          <button type="button" className="btn lobby-top-btn" onClick={() => void handleLogout()}>
            <span aria-hidden="true">⎋</span> {t('lobby.logout')}
          </button>
        )}

        {view === 'tables' ? <h1 className="lobby-title text-outline">{t('lobby.tablesTitle')}</h1> : null}

        <ProfilePill user={user} onTopUp={canTopUp ? () => void handleTopUp() : undefined} topUpBusy={topUpBusy} />

        {view === 'home' ? (
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

        {modal?.type === 'settings' ? <SettingsPanel onClose={() => setModal(null)} /> : null}
        {modal?.type === 'friend' ? (
          <JoinFriendModal
            busy={actions.busy}
            onClose={() => setModal(null)}
            onJoin={(code, password) => void actions.join(code, password)}
            onCreatePrivate={() => setModal({ type: 'create', isPublic: false })}
          />
        ) : null}
        {modal?.type === 'create' ? (
          <CreateTableModal
            balance={balance}
            initialPublic={modal.isPublic}
            busy={actions.busy}
            onClose={() => setModal(null)}
            onSubmit={(options) => void handleCreate(options)}
          />
        ) : null}
        {modal?.type === 'password' ? (
          <PasswordModal
            busy={actions.busy}
            onClose={() => setModal(null)}
            onSubmit={(password) => void actions.join(modal.table.code, password, modal.table.stake)}
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

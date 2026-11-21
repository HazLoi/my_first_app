import { useEffect, useState } from 'react';
import { gateway } from '@/services';
import { useTableStore } from '@/store/tableStore';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import type { TableState } from '@/services/types';

/**
 * Đăng ký nhận trạng thái bàn từ gateway (mock hoặc polling) và đẩy vào Zustand.
 * Chỉ cập nhật store khi state thật sự đổi (version/phase) nên animation không bị giật khi reconcile.
 */
export function useTable(code: string | undefined): void {
  useEffect(() => {
    if (!code) return undefined;
    const store = useTableStore;
    store.getState().reset(code);
    let previous: TableState | null = null;

    const unsubscribe = gateway().subscribeTable(code, {
      onState(next) {
        const known = previous;
        previous = next;
        const current = store.getState().table;
        if (
          current &&
          current.version === next.version &&
          current.phase === next.phase &&
          current.submitted === next.submitted &&
          current.players.length === next.players.length &&
          current.balance === next.balance
        ) {
          return;
        }
        if (known) {
          const before = new Set(known.players.map((player) => player.id));
          const after = new Set(next.players.map((player) => player.id));
          for (const player of next.players) {
            if (!before.has(player.id) && player.id !== next.selfId) {
              store.getState().pushToast(t('table.toast.joined', { name: player.name }), 'good');
            }
          }
          for (const player of known.players) {
            if (!after.has(player.id) && player.id !== next.selfId) {
              store.getState().pushToast(t('table.toast.left', { name: player.name }), 'warn');
            }
          }
        }
        store.getState().applyState(next);
        const me = next.players.find((player) => player.id === next.selfId);
        if (me && next.phase !== 'revealing' && next.phase !== 'scoring') {
          useAuthStore.getState().setBalance(me.balance);
        }
      },
      onStatus: (status) => store.getState().setStatus(status),
      onEvent(event) {
        if ((event.type === 'chat' || event.type === 'emoji') && event.playerId && event.text) {
          store.getState().setBubble(event.playerId, { text: event.text, emoji: event.type === 'emoji', at: event.at });
        }
      },
      onClosed: (reason, message) => store.getState().setClosed({ reason, message }),
    });
    return () => {
      unsubscribe();
      store.getState().reset(null);
    };
  }, [code]);
}

/** Số giây còn lại tới deadline (giờ server), cập nhật ~10 lần/giây. */
export function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(() => (deadline ? Math.max(0, (deadline - gateway().serverNow()) / 1000) : 0));
  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return undefined;
    }
    const tick = (): void => setRemaining(Math.max(0, (deadline - gateway().serverNow()) / 1000));
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return remaining;
}

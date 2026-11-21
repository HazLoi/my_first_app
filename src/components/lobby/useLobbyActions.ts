import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STAKES } from '@/config/rules';
import { getGame, type GameId } from '@/config/games';
import { formatChips, t } from '@/i18n';
import { canAfford, minBalanceFor, quickPlayStake } from '@/lib/lobbyLogic';
import { gateway } from '@/services';
import { playSound } from '@/services/sound';
import { GatewayError, type CreateTableOptions, type TableState } from '@/services/types';
import { useAuthStore } from '@/store/authStore';

type Toast = (text: string, tone?: 'info' | 'error' | 'success') => void;

const currentBalance = (): number => useAuthStore.getState().session?.user.balance ?? 0;

const errorText = (error: unknown): string =>
  error instanceof GatewayError && error.message ? error.message : t('common.networkError');

/** Các thao tác vào bàn từ sảnh: kiểm tra xu, gọi gateway, báo lỗi tiếng Việt, điều hướng. */
export function useLobbyActions(toast: Toast, gameType: GameId) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const enter = useCallback((code: string) => navigate(`/table/${code}`), [navigate]);

  const needCoins = useCallback(
    (stake: number): void => {
      toast(t('lobby.needCoins', { amount: formatChips(minBalanceFor(stake)), stake: formatChips(stake) }), 'error');
    },
    [toast],
  );

  /** Trả về true nếu đủ xu cho mức cược, nếu không thì báo lỗi. */
  const checkStake = useCallback(
    (stake: number): boolean => {
      if (canAfford(currentBalance(), stake)) return true;
      needCoins(stake);
      return false;
    },
    [needCoins],
  );

  const run = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T | null> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      try {
        return await task();
      } catch (error) {
        toast(errorText(error), 'error');
        return null;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toast],
  );

  /** Với bàn chưa biết mức cược (nhập mã), kiểm tra lại sau khi vào và rời bàn nếu thiếu xu. */
  const rejectIfPoor = useCallback(async (state: TableState): Promise<void> => {
    if (canAfford(currentBalance(), state.stake)) return;
    await gateway()
      .leaveTable(state.code)
      .catch(() => undefined);
    throw new GatewayError(
      t('lobby.needCoins', { amount: formatChips(minBalanceFor(state.stake)), stake: formatChips(state.stake) }),
    );
  }, []);

  const quickPlay = useCallback(async (): Promise<void> => {
    const stake = gameType === 'tienlen'
      ? getGame(gameType).betLevels.filter((value) => value <= 200 && canAfford(currentBalance(), value)).sort((a, b) => b - a)[0] ?? null
      : quickPlayStake(currentBalance());
    if (stake === null) {
      toast(t('lobby.needCoinsQuick', { amount: formatChips(minBalanceFor(STAKES[0])) }), 'error');
      return;
    }
    playSound('click');
    const state = await run(async () => {
      const joined = await gateway().quickPlay(stake, gameType);
      await rejectIfPoor(joined);
      return joined;
    });
    if (state) enter(state.code);
  }, [enter, gameType, rejectIfPoor, run, toast]);

  const returnToTable = useCallback(async (): Promise<void> => {
    playSound('click');
    const result = await run(async () => ({ code: await gateway().currentTableCode() }));
    if (!result) return;
    if (result.code) enter(result.code);
    else toast(t('lobby.noCurrentTable'), 'info');
  }, [enter, run, toast]);

  const join = useCallback(
    async (code: string, password?: string, knownStake?: number): Promise<boolean> => {
      if (knownStake !== undefined && !checkStake(knownStake)) return false;
      playSound('click');
      const state = await run(async () => {
        const joined = await gateway().joinTable(code, password || undefined, gameType);
        await rejectIfPoor(joined);
        return joined;
      });
      if (!state) return false;
      enter(state.code);
      return true;
    },
    [checkStake, enter, gameType, rejectIfPoor, run],
  );

  const create = useCallback(
    async (options: CreateTableOptions): Promise<TableState | null> => {
      if (!checkStake(options.stake)) return null;
      playSound('click');
      return run(() => gateway().createTable({ ...options, gameType }));
    },
    [checkStake, gameType, run],
  );

  return { busy, enter, checkStake, quickPlay, returnToTable, join, create };
}

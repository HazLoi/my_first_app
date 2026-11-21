import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [hasCurrentTable, setHasCurrentTable] = useState(false);
  const busyRef = useRef(false);

  const enter = useCallback((code: string) => {
    sessionStorage.setItem('zp_last_table', code);
    setHasCurrentTable(true);
    navigate(`/table/${code}`);
  }, [navigate]);

  useEffect(() => {
    let active = true;
    gateway().currentTableCode().then((code) => {
      if (!active) return;
      setHasCurrentTable(code !== null);
      if (code !== null) {
        sessionStorage.setItem('zp_last_table', code);
      } else if (sessionStorage.getItem('zp_last_table')) {
        sessionStorage.removeItem('zp_last_table');
        toast(t('lobby.tableClosed'), 'info');
      }
    }).catch((error: unknown) => {
      if (active) toast(errorText(error), 'error');
    });
    return () => { active = false; };
  }, [toast]);

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
      if (gateway().kind === 'polling') return true;
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
    if (state.gameType === 'tienlen' && state.tienlen?.scoringMode === 'points') return;
    if (canAfford(state.balance, state.stake)) return;
    await gateway()
      .leaveTable(state.code)
      .catch(() => undefined);
    throw new GatewayError(
      t('lobby.needCoins', { amount: formatChips(minBalanceFor(state.stake)), stake: formatChips(state.stake) }),
    );
  }, []);

  const recordAutoTopup = useCallback((state: TableState): void => {
    if (state.autoTopupAmount !== undefined) {
      useAuthStore.getState().setBalance(state.balance, state.autoTopupAmount);
    }
  }, []);

  const quickPlay = useCallback(async (): Promise<void> => {
    const stake = gameType === 'tienlen'
      ? getGame(gameType).betLevels
        .filter((value) => value <= 200 && canAfford(currentBalance(), value))
        .sort((a, b) => b - a)[0]
        ?? getGame(gameType).betLevels[0]
        ?? null
      : quickPlayStake(currentBalance()) ?? (gateway().kind === 'polling' ? STAKES[0] : null);
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
    if (state) {
      recordAutoTopup(state);
      enter(state.code);
    }
  }, [enter, gameType, recordAutoTopup, rejectIfPoor, run, toast]);

  const returnToTable = useCallback(async (): Promise<void> => {
    playSound('click');
    const result = await run(async () => ({ code: await gateway().currentTableCode() }));
    if (!result) return;
    if (result.code) enter(result.code);
    else {
      setHasCurrentTable(false);
      const hadTable = sessionStorage.getItem('zp_last_table') !== null;
      sessionStorage.removeItem('zp_last_table');
      toast(t(hadTable ? 'lobby.tableClosed' : 'lobby.noCurrentTable'), 'info');
    }
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
      recordAutoTopup(state);
      enter(state.code);
      return true;
    },
    [checkStake, enter, gameType, recordAutoTopup, rejectIfPoor, run],
  );

  const create = useCallback(
    async (options: CreateTableOptions): Promise<TableState | null> => {
      if (!checkStake(options.stake)) return null;
      playSound('click');
      const state = await run(() => gateway().createTable({ ...options, gameType }));
      if (state) {
        recordAutoTopup(state);
        sessionStorage.setItem('zp_last_table', state.code);
        setHasCurrentTable(true);
      }
      return state;
    },
    [checkStake, gameType, recordAutoTopup, run],
  );

  return { busy, hasCurrentTable, enter, checkStake, quickPlay, returnToTable, join, create };
}

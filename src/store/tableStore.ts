import { create } from 'zustand';
import type { ConnectionStatus, TableState } from '@/services/types';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'good';
}

export interface Bubble {
  text: string;
  emoji?: boolean;
  at: number;
}

export interface TableStoreState {
  code: string | null;
  table: TableState | null;
  status: ConnectionStatus;
  toasts: Toast[];
  /** Bong bóng chat/emoji theo playerId. */
  bubbles: Record<string, Bubble>;
  closed: { reason: 'kicked' | 'gone' | 'cancelled'; message?: string } | null;
  applyState(table: TableState): void;
  setStatus(status: ConnectionStatus): void;
  pushToast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  setBubble(playerId: string, bubble: Bubble): void;
  setClosed(closed: TableStoreState['closed']): void;
  reset(code?: string | null): void;
}

let toastId = 1;

export const useTableStore = create<TableStoreState>((set) => ({
  code: null,
  table: null,
  status: 'online',
  toasts: [],
  bubbles: {},
  closed: null,
  applyState: (table) => set({ table }),
  setStatus: (status) => set({ status }),
  pushToast: (text, tone = 'info') =>
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id: toastId++, text, tone }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  setBubble: (playerId, bubble) => set((state) => ({ bubbles: { ...state.bubbles, [playerId]: bubble } })),
  setClosed: (closed) => set({ closed }),
  reset: (code = null) => set({ code, table: null, status: 'online', toasts: [], bubbles: {}, closed: null }),
}));

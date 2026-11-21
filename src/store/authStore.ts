import { create } from 'zustand';
import type { LoginInput, RegisterInput, Session, UserProfile } from '@/services/authTypes';
import { authService } from '@/services';

const KEY = 'zp_session';

function readStored(): Session | null {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      /* bỏ qua dữ liệu hỏng */
    }
  }
  return null;
}

function writeStored(session: Session | null, remember: boolean): void {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  if (session) (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
}

export interface AuthState {
  session: Session | null;
  /** Đã thử khôi phục phiên đã lưu (để guard route biết lúc nào quyết định). */
  ready: boolean;
  remember: boolean;
  restore(): Promise<void>;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  refreshProfile(): Promise<void>;
  topUp(amount: number): Promise<void>;
  /** Cập nhật số xu cục bộ (sau ván chơi) mà không gọi API. */
  setBalance(balance: number, autoTopupAmount?: number): void;
  consumeAutoTopupNotice(): number | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  ready: false,
  remember: true,

  async restore() {
    const stored = readStored();
    if (!stored) {
      set({ ready: true });
      return;
    }
    const remember = localStorage.getItem(KEY) !== null;
    set({ session: stored, remember });
    try {
      const user = await authService().me(stored.token);
      const session = { ...stored, user };
      writeStored(session, remember);
      set({ session, ready: true });
    } catch (error) {
      // Chỉ bỏ phiên khi server từ chối; lỗi mạng giữ phiên cũ.
      if ((error as { status?: number }).status === 401 || (error as { status?: number }).status === 403) {
        writeStored(null, remember);
        set({ session: null, ready: true });
      } else {
        set({ ready: true });
      }
    }
  },

  async login(input) {
    const session = await authService().login(input);
    writeStored(session, input.remember);
    set({ session, remember: input.remember, ready: true });
  },

  async register(input) {
    const session = await authService().register(input);
    writeStored(session, input.remember);
    set({ session, remember: input.remember, ready: true });
  },

  async logout() {
    const { session, remember } = get();
    set({ session: null });
    writeStored(null, remember);
    if (session) await authService().logout(session.token).catch(() => undefined);
  },

  async refreshProfile() {
    const { session, remember } = get();
    if (!session) return;
    const user = await authService().me(session.token);
    const next = { ...session, user };
    writeStored(next, remember);
    set({ session: next });
  },

  async topUp(amount) {
    const { session, remember } = get();
    const service = authService();
    if (!session || !service.topUp) return;
    const user: UserProfile = await service.topUp(session.token, amount);
    const next = { ...session, user };
    writeStored(next, remember);
    set({ session: next });
  },

  setBalance(balance, autoTopupAmount) {
    const { session, remember } = get();
    if (!session || (session.user.balance === balance && autoTopupAmount === undefined)) return;
    const next = {
      ...session,
      user: {
        ...session.user,
        balance,
        ...(autoTopupAmount === undefined ? {} : { autoTopupAmount }),
      },
    };
    writeStored(next, remember);
    set({ session: next });
  },

  consumeAutoTopupNotice() {
    const { session, remember } = get();
    const amount = session?.user.autoTopupAmount;
    if (!session || !amount) return null;
    const next = { ...session, user: { ...session.user } };
    delete next.user.autoTopupAmount;
    writeStored(next, remember);
    set({ session: next });
    return amount;
  },
}));

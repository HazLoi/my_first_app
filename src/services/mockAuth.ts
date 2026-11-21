import { STARTING_BALANCE } from '@/config/rules';
import type { AuthService, LoginInput, RegisterInput, Session, UserProfile } from './authTypes';
import { GatewayError } from './types';

const USERS_KEY = 'zp_mock_users';
const TOKENS_KEY = 'zp_mock_tokens';

interface MockUser extends UserProfile {
  password: string;
}

const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown): void => localStorage.setItem(key, JSON.stringify(value));

const publicUser = ({ password: _password, ...user }: MockUser): UserProfile => user;

export function mockUserByToken(token: string): MockUser | null {
  const phone = read<Record<string, string>>(TOKENS_KEY, {})[token];
  return phone ? (read<Record<string, MockUser>>(USERS_KEY, {})[phone] ?? null) : null;
}

export function updateMockBalance(token: string, balance: number): void {
  const phone = read<Record<string, string>>(TOKENS_KEY, {})[token];
  const users = read<Record<string, MockUser>>(USERS_KEY, {});
  if (phone && users[phone]) {
    users[phone] = { ...users[phone], balance };
    write(USERS_KEY, users);
  }
}

function issueToken(phone: string): string {
  const tokens = read<Record<string, string>>(TOKENS_KEY, {});
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  tokens[token] = phone;
  write(TOKENS_KEY, tokens);
  return token;
}

const normalizePhone = (phone: string): string => phone.replace(/[\s.-]/g, '');
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Xác thực giả bằng localStorage — cùng giao diện với ApiAuthService để sau này thay bằng API. */
export class MockAuthService implements AuthService {
  async login(input: LoginInput): Promise<Session> {
    await delay(350);
    const phone = normalizePhone(input.phone);
    const user = read<Record<string, MockUser>>(USERS_KEY, {})[phone];
    if (!user || user.password !== input.password) {
      throw new GatewayError('Số điện thoại hoặc mật khẩu không đúng.', 401);
    }
    return { token: issueToken(phone), user: publicUser(user) };
  }

  async register(input: RegisterInput): Promise<Session> {
    await delay(450);
    const phone = normalizePhone(input.phone);
    const users = read<Record<string, MockUser>>(USERS_KEY, {});
    if (users[phone]) throw new GatewayError('Số điện thoại này đã được đăng ký.', 409);
    const user: MockUser = {
      id: crypto.randomUUID(),
      phone,
      displayName: input.displayName.trim() || `Người chơi ${phone.slice(-4)}`,
      role: 'player',
      balance: STARTING_BALANCE,
      level: 1,
      avatar: Math.floor(Math.random() * 8),
      password: input.password,
    };
    users[phone] = user;
    write(USERS_KEY, users);
    return { token: issueToken(phone), user: publicUser(user) };
  }

  async logout(token: string): Promise<void> {
    const tokens = read<Record<string, string>>(TOKENS_KEY, {});
    delete tokens[token];
    write(TOKENS_KEY, tokens);
  }

  async me(token: string): Promise<UserProfile> {
    const user = mockUserByToken(token);
    if (!user) throw new GatewayError('Phiên đăng nhập đã hết hạn.', 401);
    return publicUser(user);
  }

  async topUp(token: string, amount: number): Promise<UserProfile> {
    const user = mockUserByToken(token);
    if (!user) throw new GatewayError('Phiên đăng nhập đã hết hạn.', 401);
    updateMockBalance(token, user.balance + amount);
    return this.me(token);
  }
}

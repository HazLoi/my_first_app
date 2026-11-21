import { apiFetch } from './apiClient';
import type { AuthService, LoginInput, RegisterInput, Session, UserProfile } from './authTypes';

interface AuthResponse {
  accessToken: string;
  expiresAt?: string;
  user: UserProfile;
}

/** Đăng nhập bằng số điện thoại + mật khẩu qua API PHP (/auth/*). */
export class ApiAuthService implements AuthService {
  async login(input: LoginInput): Promise<Session> {
    const { data } = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { phone: input.phone, password: input.password },
    });
    return { token: data.accessToken, expiresAt: data.expiresAt, user: data.user };
  }

  async register(input: RegisterInput): Promise<Session> {
    const { data } = await apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { phone: input.phone, password: input.password, displayName: input.displayName },
    });
    return { token: data.accessToken, expiresAt: data.expiresAt, user: data.user };
  }

  async logout(token: string): Promise<void> {
    await apiFetch('/auth/logout', { method: 'POST', body: {}, token });
  }

  async me(token: string): Promise<UserProfile> {
    const { data } = await apiFetch<{ user: UserProfile }>('/auth/me', { token });
    return data.user;
  }
}

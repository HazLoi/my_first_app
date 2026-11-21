import { GATEWAY_KIND } from '@/config/env';
import type { AuthService } from './authTypes';
import type { GameGateway } from './types';
import { ApiAuthService } from './apiAuth';
import { MockAuthService } from './mockAuth';
import { MockGateway } from './MockGateway';
import { PollingGateway } from './PollingGateway';

let gatewayInstance: GameGateway | null = null;
let authInstance: AuthService | null = null;

/** Chọn bằng VITE_GATEWAY=polling|mock. */
export function gateway(): GameGateway {
  gatewayInstance ??= GATEWAY_KIND === 'mock' ? new MockGateway() : new PollingGateway();
  return gatewayInstance;
}

export function authService(): AuthService {
  authInstance ??= GATEWAY_KIND === 'mock' ? new MockAuthService() : new ApiAuthService();
  return authInstance;
}

export type { GameGateway, AuthService };
export * from './types';

export type GatewayKind = 'mock' | 'polling';

const rawGateway = import.meta.env.VITE_GATEWAY as string | undefined;

/** mock khi dev nếu không cấu hình; polling (API PHP) cho bản build. */
export const GATEWAY_KIND: GatewayKind =
  rawGateway === 'mock' || rawGateway === 'polling' ? rawGateway : import.meta.env.DEV ? 'mock' : 'polling';

export const LONG_POLL = import.meta.env.VITE_LONG_POLL === '1';

export function apiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    return 'http://127.0.0.1:8787/api_zingplay';
  }
  return `${typeof location !== 'undefined' ? location.origin : ''}/api_zingplay`;
}

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

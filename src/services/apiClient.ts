import { apiBaseUrl } from '@/config/env';
import { GatewayError } from './types';

export interface ApiRequest {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  data: T;
  /** Giờ server (ms) từ trường serverTime hoặc header Date, nếu có. */
  serverTime: number | null;
  /** Thời gian khứ hồi (ms). */
  rtt: number;
}

/** fetch + AbortController (timeout), chuẩn hóa lỗi thành GatewayError. */
export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), request.timeoutMs ?? 12_000);
  const forward = (): void => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', forward, { once: true });
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: request.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
      },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (request.signal?.aborted) throw error;
    throw new GatewayError('Không kết nối được máy chủ. Vui lòng thử lại.', 0);
  } finally {
    window.clearTimeout(timeout);
    request.signal?.removeEventListener('abort', forward);
  }
  const rtt = performance.now() - started;
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    if (response.ok) throw new GatewayError('Máy chủ trả dữ liệu không hợp lệ.', response.status);
  }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error ?? 'Máy chủ không thể xử lý yêu cầu.';
    throw new GatewayError(message, response.status);
  }
  const bodyTime = (data as { serverTime?: number } | null)?.serverTime;
  const header = response.headers.get('Date');
  const serverTime = typeof bodyTime === 'number' ? bodyTime : header ? Date.parse(header) || null : null;
  return { data: data as T, serverTime, rtt };
}

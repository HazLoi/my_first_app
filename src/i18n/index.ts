import { viCommon } from './vi.common';
import { viLobby } from './vi.lobby';
import { viTable } from './vi.table';

/** Toàn bộ chữ hiển thị (tiếng Việt). Mỗi màn hình có file riêng để dễ quản lý. */
export const vi = { ...viCommon, ...viLobby, ...viTable } as const;

export type MessageKey = keyof typeof vi;

/** t('khóa', {tham_số}) — thay {tham_số} trong chuỗi. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text: string = vi[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export const formatChips = (value: number): string => new Intl.NumberFormat('vi-VN').format(Math.round(value));
export const formatSigned = (value: number): string => (value > 0 ? `+${formatChips(value)}` : formatChips(value));

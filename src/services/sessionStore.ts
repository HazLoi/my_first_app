import type { Session } from './authTypes';

const KEY = 'zp_session';

/** Đọc phiên đăng nhập đã lưu (dùng ở tầng service để tránh vòng phụ thuộc với store). */
export function readSession(): Session | null {
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

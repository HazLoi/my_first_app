import type { MessageKey } from '@/i18n';

export type AuthMode = 'login' | 'register';

export interface AuthValues {
  phone: string;
  password: string;
  confirm: string;
  displayName: string;
}

export type AuthField = keyof AuthValues;
export type AuthErrors = Partial<Record<AuthField, MessageKey>>;

export const DISPLAY_NAME_MAX = 20;

/** Bỏ khoảng trắng, dấu chấm, gạch ngang, ngoặc trong số điện thoại. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, '');
}

/** SĐT 8–15 chữ số, có thể bắt đầu bằng 0 hoặc +84 (hoặc mã quốc tế khác). */
export function validatePhone(raw: string): MessageKey | null {
  const phone = normalizePhone(raw);
  if (!phone) return 'auth.errPhoneRequired';
  return /^\+?\d{8,15}$/.test(phone) ? null : 'auth.errPhoneInvalid';
}

export function validateAuthForm(mode: AuthMode, values: AuthValues): AuthErrors {
  const errors: AuthErrors = {};
  const phoneError = validatePhone(values.phone);
  if (phoneError) errors.phone = phoneError;
  if (!values.password) errors.password = 'auth.errPasswordRequired';
  if (mode === 'register') {
    if (values.displayName.trim().length > DISPLAY_NAME_MAX) errors.displayName = 'auth.errNameLong';
    if (!values.confirm) errors.confirm = 'auth.errConfirmRequired';
    else if (values.confirm !== values.password) errors.confirm = 'auth.errConfirmMismatch';
  }
  return errors;
}

/** Thứ tự trường để focus vào lỗi đầu tiên. */
export const AUTH_FIELD_ORDER: AuthField[] = ['phone', 'displayName', 'password', 'confirm'];

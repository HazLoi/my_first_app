import { describe, expect, it } from 'vitest';
import { normalizePhone, validateAuthForm, validatePhone } from './authValidation';
import {
  canAfford,
  filterTables,
  isValidRoomCode,
  normalizeRoomCode,
  quickPlayStake,
  tableKind,
} from './lobbyLogic';
import type { TableSummary } from '@/services/types';

const table = (patch: Partial<TableSummary> = {}): TableSummary => ({
  code: 'ABCDE',
  hostName: 'An',
  playerCount: 1,
  maxPlayers: 4,
  stake: 100,
  hasPassword: false,
  phase: 'waiting',
  round: 0,
  ...patch,
});

describe('validate form đăng nhập/đăng ký', () => {
  it('chấp nhận SĐT 0xxx, +84xxx và có khoảng trắng', () => {
    expect(validatePhone('0912 345 678')).toBeNull();
    expect(validatePhone('+84 912-345-678')).toBeNull();
    expect(normalizePhone(' 0912.345.678 ')).toBe('0912345678');
  });

  it('từ chối SĐT sai độ dài hoặc có chữ', () => {
    expect(validatePhone('')).toBe('auth.errPhoneRequired');
    expect(validatePhone('1234567')).toBe('auth.errPhoneInvalid');
    expect(validatePhone('1234567890123456')).toBe('auth.errPhoneInvalid');
    expect(validatePhone('09123abc78')).toBe('auth.errPhoneInvalid');
  });

  it('đăng nhập chỉ cần SĐT + mật khẩu', () => {
    const base = { phone: '0912345678', password: 'x', confirm: '', displayName: '' };
    expect(validateAuthForm('login', base)).toEqual({});
    expect(validateAuthForm('login', { ...base, password: '' })).toEqual({ password: 'auth.errPasswordRequired' });
  });

  it('đăng ký kiểm tra nhập lại mật khẩu và tên quá dài', () => {
    const base = { phone: '0912345678', password: 'abc', confirm: 'abd', displayName: '' };
    expect(validateAuthForm('register', base).confirm).toBe('auth.errConfirmMismatch');
    expect(validateAuthForm('register', { ...base, confirm: '' }).confirm).toBe('auth.errConfirmRequired');
    expect(validateAuthForm('register', { ...base, confirm: 'abc', displayName: 'a'.repeat(25) }).displayName).toBe(
      'auth.errNameLong',
    );
    expect(validateAuthForm('register', { ...base, confirm: 'abc' })).toEqual({});
  });
});

describe('logic sảnh', () => {
  const tables = [
    table({ code: 'AAAAA' }),
    table({ code: 'BBBBB', playerCount: 4 }),
    table({ code: 'CCCCC', phase: 'arranging', playerCount: 2 }),
    table({ code: 'DDDDD', phase: 'arranging', playerCount: 4 }),
  ];

  it('lọc theo tab', () => {
    expect(filterTables(tables, 'all')).toHaveLength(4);
    expect(filterTables(tables, 'open').map((x) => x.code)).toEqual(['AAAAA', 'CCCCC']);
    expect(filterTables(tables, 'waiting').map((x) => x.code)).toEqual(['AAAAA', 'BBBBB']);
  });

  it('phân loại icon bàn', () => {
    expect(tableKind(table())).toBe('open');
    expect(tableKind(table({ phase: 'dealing' }))).toBe('playing');
    expect(tableKind(table({ playerCount: 4 }))).toBe('playing');
    expect(tableKind(table({ stake: 500, phase: 'dealing' }))).toBe('high');
  });

  it('kiểm tra xu tối thiểu 20 × mức cược', () => {
    expect(canAfford(2000, 100)).toBe(true);
    expect(canAfford(1999, 100)).toBe(false);
    expect(quickPlayStake(10_000)).toBe(200);
    expect(quickPlayStake(2500)).toBe(100);
    expect(quickPlayStake(999)).toBeNull();
  });

  it('chuẩn hóa mã bàn', () => {
    expect(normalizeRoomCode(' ab-c1d9ef ')).toBe('ABCD9');
    expect(isValidRoomCode('AB2C9')).toBe(true);
    expect(isValidRoomCode('AB2C')).toBe(false);
    expect(isValidRoomCode('AB1C9')).toBe(false);
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';
import { LobbyScreen } from './LobbyScreen';

const mocks = vi.hoisted(() => ({ currentTableCode: vi.fn() }));
vi.mock('@/services', () => ({
  gateway: () => ({ kind: 'polling', currentTableCode: mocks.currentTableCode }),
}));
vi.mock('@/services/sound', () => ({ playSound: vi.fn() }));

function TableRoute() {
  const { id } = useParams();
  return <div>Bàn {id}</div>;
}

let host: HTMLDivElement;
let root: Root;

function button(text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function renderLobby() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/lobby']}><Routes>
    <Route path="/lobby" element={<LobbyScreen />} />
    <Route path="/table/:id" element={<TableRoute />} />
  </Routes></MemoryRouter>));
  const gameCard = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Xập Xám'));
  if (!gameCard) throw new Error('Missing Xập Xám game card');
  await act(async () => gameCard.click());
}

describe('quay lại bàn cũ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
    Object.defineProperty(screen, 'orientation', { configurable: true, value: {} });
    useAuthStore.setState({
      ready: true,
      session: { token: 'test', user: { id: 'u', phone: '0900000000', displayName: 'An', role: 'player', balance: 0 } },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('hiện hub sau đăng nhập và cho chọn Tiến Lên', async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={['/lobby']}><LobbyScreen /></MemoryRouter>));
    const cards = [...host.querySelectorAll('button')];
    expect(cards.find((item) => item.textContent?.includes('Xập Xám'))?.disabled).toBe(false);
    expect(cards.find((item) => item.textContent?.includes('Tiến Lên'))?.disabled).toBe(false);
    await act(async () => cards.find((item) => item.textContent?.includes('Tiến Lên'))!.click());
    expect(localStorage.getItem('zp_selected_game')).toBe('tienlen');
    await act(async () => [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Chọn game'))!.click());
    const xapxam = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Xập Xám'))!;
    await act(async () => xapxam.click());
    expect(localStorage.getItem('zp_selected_game')).toBe('xapxam');
  });

  it('vào lại bàn hiện tại kể cả khi số xu không đủ để vào bàn mới', async () => {
    mocks.currentTableCode.mockResolvedValue('ABCDE');
    await renderLobby();
    await act(async () => button('Quay lại bàn cũ').click());
    expect(mocks.currentTableCode).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Bàn ABCDE');
  });

  it('có thể quay lại ngay từ hộp tạo bàn', async () => {
    mocks.currentTableCode.mockResolvedValue('ABCDE');
    await renderLobby();
    await act(async () => button('Chơi với bạnNhập mã bàn').click());
    await act(async () => button('Tạo bàn riêng tư').click());
    const dialog = host.querySelector('[role="dialog"]');
    const returnButton = [...dialog!.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Quay lại bàn cũ');
    expect(returnButton).toBeDefined();
    await act(async () => returnButton!.click());
    expect(host.textContent).toContain('Bàn ABCDE');
  });

  it('phân biệt không có bàn với lỗi máy chủ', async () => {
    mocks.currentTableCode.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Mất kết nối'));
    await renderLobby();
    await act(async () => button('Quay lại bàn cũ').click());
    expect(host.textContent).toContain('Bạn hiện không ở trong bàn nào.');
    await act(async () => button('Quay lại bàn cũ').click());
    expect(host.textContent).toContain('Không kết nối được máy chủ');
  });
});

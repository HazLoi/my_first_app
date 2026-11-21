# Kiến trúc game hub

## Stack và luồng màn hình
- Client là React + TypeScript + Vite; `/auth` đăng nhập, `/lobby` là hub/sảnh, `/table/:id` là bàn chơi.
- `src/screens/LobbyScreen.tsx` hiển thị hub sau đăng nhập; hai game dùng chung sảnh.
- `src/config/games.json` là catalog phía client; lựa chọn được nhớ trong `localStorage` (`zp_selected_game`).
- `TablePicker`, `CreateTableModal` và `useLobbyActions` dùng lại UI hiện có với `game_type` đã chọn.
- `src/game-logic/` chứa logic Xập Xám phía client; PHP vẫn xác thực bài và tính điểm phía máy chủ.

## PHP API và dữ liệu
- Entry point: `api_zingplay/php/index.php` → `router.php` → `bootstrap.php`.
- API người dùng: `php/user/routes.php`; bàn và polling: `php/room/routes.php`; lịch sử: `php/match/routes.php`.
- Luật Xập Xám: `php/rules.php`; vòng đời/deadline các phase: `php/phase.php`.
- Dữ liệu nằm trong MySQL: `users`, `sessions`, `game_rooms`, `game_room_players`,
  `matches`, `match_players`, `wallet_transactions`.
- `game_rooms.game_type` phân loại bàn; bàn cũ mặc định `xapxam`. `game_state` dành cho state game mới.
- Ledger xu hiện ghi ở `wallet_transactions`; Xập Xám lưu kết quả trong `game_rooms.results_json`
  và lịch sử ở `matches`/`match_players`.
- Migration game hub: `sql/004_game_hub.sql`; schema cài mới cũng khai báo các cột và index này.
- Catalog PHP ở `php/config/games.php`; catalog JSON tương ứng ở `src/config/games.json`.
- Backend Tiến Lên nằm trong `php/games/tienlen/`, dùng `game_state` và sổ cái xu.
- `src/screens/TienLenScreen.tsx` và `src/game-logic/tienlen.ts` xử lý bàn Tiến Lên;
  luật client chỉ gợi ý, server xác thực. Chế độ mock chưa hỗ trợ game này.
- Luật, cấu hình và endpoint Tiến Lên: `docs/TIENLEN_RULES.md`; test: `php tests/run_tienlen.php`.
- `php/games/GameEngine.php` định nghĩa contract; `registry.php` đăng ký adapter `XapXamEngine`.
  Các route Xập Xám hiện tại vẫn dùng nguyên handler/luật cũ.

## Polling và luồng bàn
- `PollingGateway` gọi `GET /rooms/{code}` mỗi giây; gửi `since_version`, có thể bật `wait=1`.
- PHP giữ `version`, deadline và phase; poll chỉ chạy `advanceIfDue` khi đã tới hạn.
- `game_type` được gửi khi liệt kê/tạo/vào bàn và kiểm tra ở snapshot; thiếu tham số nghĩa là `xapxam`.
- Không đổi polling, deadline, `since_version`, payload luật hoặc đường dẫn API Xập Xám cũ.

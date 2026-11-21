# Quy tắc dự án

## Công nghệ

- Đây là game web thuần HTML, CSS và JavaScript trong thư mục `web/`.
- GitHub Pages triển khai trực tiếp thư mục `web/`; không dùng Flutter hoặc quy
  trình build frontend.
- Giữ game nhẹ, chạy được trên trình duyệt phổ thông và không thêm dependency
  nếu không thực sự cần.
- Multiplayer realtime là phần phát triển sau; khi bổ sung cần tách client web
  khỏi dịch vụ máy chủ và ghi rõ cách chạy/cấu hình.

## Cách làm việc

- Trả lời và giải thích bằng tiếng Việt.
- Đọc code hiện tại trước khi sửa; thay đổi ít nhất có thể và không commit/push
  nếu chưa được yêu cầu.
- Sau mỗi phần việc xong, cập nhật `GAME_PROGRESS.md` (đã làm, đã kiểm tra, việc tiếp theo); không tạo file ghi chú mới.
- Người dùng làm việc trên điện thoại: mỗi khi sửa API hoặc giao diện ZingPlay, tạo lại đúng 2 file ZIP ở thư mục gốc, ghi đè/xóa bản cũ:
  - `api_zingplay-php-upload.zip`: nội dung `api_zingplay/php/` (giải nén thẳng vào `public_html/api_zingplay/`), gồm `.htaccess`, `index.php`, `bootstrap.php`, `router.php`, `rules.php`, `phase.php`, `reset_password.php`, `config/database.php`, `config/config.example.php`, `user/`, `room/`, `match/`, `admin_api/`; không gồm `tests/`, `config/config.php`.
  - `zingplay-web-php-upload.zip`: toàn bộ nội dung `dist/` sau `npm run build`, bao gồm `.htaccess` (giải nén vào `public_html/zingplay/`).
  - Khi thêm file mới vào API hoặc giao diện, thêm vào danh sách trên. Nếu thay đổi SQL, nhắc người dùng chạy file migration tương ứng.
- Giữ các điều khiển hoạt động trên cả desktop và màn hình cảm ứng.
- Sau khi sửa JavaScript, chạy `node --check web/game.js`; kiểm tra trang tĩnh
  bằng `python3 -m http.server 8000 --directory web` khi phù hợp.

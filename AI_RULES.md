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
- Sau mỗi lần cập nhật code, kiểm tra lại diff và chạy bước kiểm tra cuối phù hợp
  với thay đổi trước khi stage/commit. Chỉ `git add` các file thuộc phạm vi công
  việc; push lên nhánh tính năng hiện tại khi được yêu cầu. Không push thẳng lên
  `main` và không dùng `git push origin main`; nếu đang ở `main`, dừng lại để
  chuyển sang nhánh tính năng trước khi push.
- Giữ các điều khiển hoạt động trên cả desktop và màn hình cảm ứng.
- Sau khi sửa JavaScript, chạy `node --check web/game.js`; kiểm tra trang tĩnh
  bằng `python3 -m http.server 8000 --directory web` khi phù hợp.

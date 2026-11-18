# Tiến độ phát triển game Không Chiến

## Mục tiêu

- Game bắn gà chạy trực tiếp trên trình duyệt bằng HTML, CSS và JavaScript.
- Chế độ offline chơi được trước; chế độ online 2 người sẽ phát triển sau.
- Hướng hình ảnh nhẹ, có chiều sâu 2.5D và không cần tải mô hình lớn.
- GitHub Pages triển khai nội dung trong `web/`.

## Đã hoàn thành

- Đã loại bỏ scaffold Flutter/Dart và các thư mục Android, iOS, Windows, macOS,
  Linux; bản làm việc chỉ còn mã game web và cấu hình triển khai.
- Đã thêm chọn chế độ: **Chiến dịch offline** chơi được; **Đấu trường online**
  được đánh dấu đang phát triển.
- Gameplay offline hiện có:
  - Điều khiển máy bay bằng WASD/phím mũi tên hoặc kéo bằng chuột/cảm ứng.
  - Bắn đạn năng lượng; đàn gà bắn trứng về phía người chơi.
  - Đàn gà theo từng đợt, số mục tiêu và độ khó tăng dần.
  - Điểm, combo, 3 mạng, bom dọn đàn, vật phẩm bom và tạm dừng.
  - Kỷ lục được lưu cục bộ bằng `localStorage`.
- Cảnh Canvas được nâng cấp theo phong cách 2.5D: phối cảnh mặt đất, nhiều lớp
  địa hình/mây, ánh sáng, máy bay và gà vẽ vector có đổ bóng.
- Đã thêm Service Worker để lưu bộ khung trang, hỗ trợ mở lại chiến dịch offline
  sau lần tải đầu tiên.
- Đã chuẩn bị workflow GitHub Pages trong `.github/workflows/pages.yml`.

## Cấu trúc hiện tại

- `web/index.html`: màn hình chọn chế độ, HUD, nút điều khiển và các lớp kết quả.
- `web/style.css`: giao diện desktop/mobile.
- `web/game.js`: trạng thái trận, điều khiển, đợt gà, bắn, va chạm, điểm và vẽ cảnh.
- `web/service-worker.js`: cache trang để hỗ trợ mở game offline.
- `README.md`: hướng dẫn chạy và triển khai.

Không có mô hình 3D thực trong bản hiện tại: hình ảnh được dựng bằng Canvas 2D
với phối cảnh/đổ bóng để giữ tải nhẹ. Chưa có server, ghép phòng hay đồng bộ
người chơi online.

## Tham khảo thiết kế

Đây là các tham khảo về cơ chế và nền tảng; không lấy mã nguồn hay hình ảnh:

- [Chicken Invaders 1 — trang chính thức](https://www.interactionstudios.com/chickeninvaders.php):
  các đợt địch tăng độ khó, nâng cấp vũ khí, boss và điểm cao.
- [Chicken Invaders 4 — tính năng trên Steam](https://store.steampowered.com/app/301300/Chicken_Invaders_4_Ultimate_Omelette/):
  các lựa chọn chơi đơn/co-op và bảng thành tích.
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API):
  vẽ cảnh trên Canvas; HTML vẫn dùng cho giao diện và trạng thái quan trọng.
- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events):
  một kiểu sự kiện thống nhất cho chuột, bút cảm ứng và chạm.
- [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API):
  cache các tài nguyên để hỗ trợ offline.
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API):
  lựa chọn trao đổi dữ liệu hai chiều khi xây backend online sau này.

## Kiểm tra gần nhất

- `node --check web/game.js`: đạt.
- `node --check web/service-worker.js`: đạt.
- `git diff --check`: đạt.
- Kiểm tra ID HTML được JavaScript tham chiếu và tài nguyên cục bộ: đạt.
- Chưa kiểm thử trực quan trên trình duyệt hoặc xác nhận offline qua Service Worker.

## Việc nên làm tiếp

1. Chạy `python3 -m http.server 8000 --directory web`, thử trên desktop và điện
   thoại; điều chỉnh kích thước máy bay/gà, HUD và vùng chạm.
2. Cân bằng tốc độ trứng, số mạng, nhịp các đợt, combo và bom theo cảm giác chơi.
3. Thử ngắt mạng sau lần tải đầu để xác nhận Service Worker hoạt động; kiểm tra
   triển khai GitHub Pages sau khi push.
4. Khi bắt đầu online, chọn backend realtime/WebSocket, thiết kế phòng 2 người
   và đồng bộ trạng thái; giữ chế độ offline hoạt động độc lập với backend.
5. Nếu cần mô hình 3D thật, đánh giá WebGL/engine riêng sau khi chốt gameplay
   2.5D và mục tiêu hiệu năng.

## Trạng thái Git

Commit nền: `4f8687d` (`feat: migrate game to static web`). Các mục hoàn thành
ở trên mô tả phiên bản phát triển tiếp theo của game.

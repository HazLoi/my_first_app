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

---

# Tiến độ ZingPlay — Binh Xập Xám (cập nhật 2026-11-21)

## Bản ZIP hiện tại

- Đã mở Tiến Lên trên hub, thêm bàn chơi, action/polling, gợi ý và khán giả chờ ván sau.
- Luật và API Tiến Lên: `docs/TIENLEN_RULES.md`; checklist giao diện/server: `docs/TEST_CHECKLIST_C.md`.
- `node tests/run_tienlen_client.mjs`: 80 kiểm tra; giao diện rollback và gateway có test.
- `php tests/run_tienlen.php`: 2118 pass (gồm 2000 ván); hồi quy realtime Xập Xám: 201 pass trên SQLite.
  Build web đạt; chưa kiểm thử Tiến Lên trên MySQL/hosting hoặc điện thoại thật.
- Chưa có hiệu ứng xu bay/số chạy ở bảng tổng kết; hiệu ứng lá đánh chưa theo hướng từng ghế.
- Database hiện có cần chạy `sql/004_game_hub.sql` trước khi cập nhật API; bàn cũ mặc định `xapxam`.
- Build và kiểm tra cú pháp PHP đạt; chưa kiểm tra migration trên MySQL/hosting thật.
- Đã thêm nút **Quay lại bàn cũ**, tìm phòng hiện tại theo tài khoản qua API,
  kể cả phòng riêng tư; không cần thay đổi database.
- Màn bàn chơi React đã nối gateway: chờ/bắt đầu ván, xếp và nộp bài, so bài,
  kết quả, lịch sử và thoát bàn; có bàn 3D và 2D dự phòng.
- Đã kiểm thử một ván với bot và một ván với hai tài khoản qua API PHP/SQLite
  cục bộ, gồm thao tác chuột và cảm ứng. Chưa xác nhận trên MySQL/hosting thật.
- Trước thay đổi khôi phục phòng, 163 test frontend và build đạt; test luật PHP,
  194 kiểm tra realtime và 5 test API đạt. Chưa xác nhận thay đổi mới trên hosting thật.
- Đăng ký dùng tên hiển thị đã nhập (tối đa 20 ký tự theo schema); chat online
  chưa được backend hỗ trợ.
- Khi cập nhật database cũ, xem `DEPLOY.md` và chạy `api_zingplay/migrate_realtime.sql`
  nếu chưa áp dụng. Không cần migration mới cho phần bàn chơi này.
- Các mục lịch sử bên dưới mô tả phiên bản trước, không đại diện đầy đủ cho bản build hiện tại.

Backend PHP/MySQL trong `api_zingplay/php/`, giao diện trong `web/zingplay/`.
Hướng dẫn triển khai: `HUONG_DAN_KET_NOI_DATABASE_GAME_ONLINE.md`, API: `api_zingplay/README.md`.

## Đã hoàn thành

- Bàn 3D (CSS perspective), xếp 3 chi 3+5+5 lá bằng kéo thả/chạm, nhãn từng chi, chặn binh lủng, gợi ý.
- Phòng riêng/công khai, sảnh bàn, 2–4 người, polling 1,2 giây, lịch sử ván.
- **Luật tính điểm mới** (`rules.php`): thắng chi = 1 điểm, hoặc nhiều hơn với bài đặc biệt
  (chi đầu sám 3; chi giữa cù lũ 2, tứ quý 8, thùng phá sảnh 10; chi cuối tứ quý 4, thùng phá sảnh 5).
  Sập hầm nhân đôi khoản của cặp đó; sập làng (thắng sập hầm mọi đối thủ, từ 3 người) nhân đôi thêm.
- **Xu ảo**: tặng 10.000 xu khi đăng ký; mức cược 50/100/200/500/1000 xu mỗi điểm chọn khi tạo bàn;
  cần tối thiểu 20 × mức cược để tạo/vào/bắt đầu; thanh toán `điểm × cược` trong cùng giao dịch
  lưu ván, người thua chỉ mất tối đa số dư, tiền thắng chia lại theo tỷ lệ; mọi thay đổi ghi vào
  `wallet_transactions`.
- **Admin**: cấp quyền bằng SQL (`UPDATE users SET role='admin' WHERE phone='+84…'`), API `/admin/*`
  (`admin_api/routes.php`), trang `web/zingplay/admin.html` + `admin.js`: thống kê, tìm tài khoản,
  cộng/trừ xu, khóa/mở khóa, sổ xu, ván gần đây.
- SQL: `schema.sql` (database mới) và `migrate_wallet.sql` (database cũ, đã thử trên MariaDB).
- Giao diện: số dư, chọn mức cược, hiện cược trong sảnh/phòng, màn so bài hiện bài mọi người
  kèm điểm từng chi và tiền thắng thua.

## Kiểm tra gần nhất

- Đã thêm cấu hình Apache hạn chế cache giao diện và đổi phiên bản tài nguyên. Tab từng lưu bản cũ có thể cần tải lại mạnh hoặc xóa dữ liệu trang sau khi triển khai; cấu hình cần `mod_headers` và cho phép `.htaccess`.
- Đăng ký và đăng nhập bằng mật khẩu một ký tự đã được kiểm thử ở cả giao diện và API. Mật khẩu ngắn không an toàn, nên dùng mật khẩu mạnh khi chơi thực tế.
- `php api_zingplay/php/tests/rules_test.php`: đạt.
- `node --test api_zingplay/php/tests/api.test.js web/zingplay/game.test.js`: 12/12 đạt.
- Chạy luồng đăng ký → tạo bàn → chia bài → chốt bài → thanh toán và API admin trên MariaDB 10.11
  (Docker): đạt, tổng điểm và tổng xu của ván bằng 0.
- **Chưa** mở giao diện (game + admin.html) trên trình duyệt thật.

## Việc cần làm tiếp

1. Thử trên trình duyệt/điện thoại: màn chọn cược, màn so bài (`.result-player`), `admin.html`.
2. Triển khai lên hosting: tải `api_zingplay/php/` và `web/zingplay/` (cả `admin.html`, `admin.js`),
   chạy `migrate_wallet.sql` một lần, rồi cấp quyền admin bằng SQL. Hai file ZIP trong thư mục gốc đã được tạo lại (2026-11-21) khớp mã hiện tại; sau mỗi lần sửa API/giao diện phải tạo lại (xem `AI_RULES.md`).
3. Bố cục bàn theo ảnh mẫu (3 cột ngang: chi đầu 3 lá, hai chi 5 lá) vẫn chưa làm; hiện là 3 chi xếp dọc.
4. Chưa có mậu binh đặc biệt (sảnh rồng, 3 sảnh, 3 thùng…).
5. Có thể bổ sung: xem sổ xu của chính người chơi, phạt khi rời bàn giữa ván (hiện hủy ván, không trừ xu),
   đặt lại mật khẩu từ trang admin (hiện chỉ có `reset_password.php` CLI).
6. Xu chỉ là tiền ảo, không nạp/rút/quy đổi tiền thật.

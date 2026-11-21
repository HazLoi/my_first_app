# Triển khai ZingPlay lên cPanel (không cần Node.js trên server)

Giao diện là bản build tĩnh (Vite) đặt trong `public_html/zingplay/`; dữ liệu lấy qua API PHP/MySQL có sẵn
tại `public_html/api_zingplay/` (HTTP polling, không WebSocket, không Socket.IO).

```
https://blastbaal.id.vn/zingplay/        ← giao diện (thư mục dist/)
https://blastbaal.id.vn/api_zingplay/    ← API PHP (api_zingplay/php/)
```

## 1. Build trên máy của bạn

```sh
npm install
npm run build        # chạy tsc + vite build, xuất ra thư mục dist/
```

- `vite.config.ts` đã đặt `base: '/zingplay/'` và dùng `HashRouter` nên **không cần rewrite** (`/zingplay/#/lobby`).
- Bản build production mặc định dùng `PollingGateway` (gọi API PHP). Muốn chạy thử với bot ở máy mình:
  `VITE_GATEWAY=mock npm run dev`.
- Biến môi trường (xem `.env.example`; đặt lúc build, ví dụ `VITE_API_URL=https://blastbaal.id.vn/api_zingplay npm run build`):

| Biến | Ý nghĩa | Mặc định |
| --- | --- | --- |
| `VITE_GATEWAY` | `polling` (API PHP) hoặc `mock` (bot cục bộ) | `polling` khi build, `mock` khi `npm run dev` |
| `VITE_API_URL` | Địa chỉ API PHP | `<origin>/api_zingplay` (localhost: `http://127.0.0.1:8787/api_zingplay`) |
| `VITE_LONG_POLL` | `1` = dùng long-poll (phải bật `long_poll` trong `config.php` của PHP) | `0` |

## 2. Upload giao diện

Màn bàn chơi hỗ trợ xếp bài và chơi nhiều người qua API PHP. Chế độ `mock`
chỉ chạy bot trong trình duyệt, không kết nối người chơi ở thiết bị khác.

1. Trong cPanel → **File Manager** → `public_html/`, tạo thư mục `zingplay` (nếu chưa có) và xóa nội dung cũ.
2. Upload **toàn bộ nội dung** của `dist/` (không phải thư mục `dist` mình nó) vào `public_html/zingplay/`, nhớ bật
   *Show Hidden Files* để thấy `.htaccess`. Có thể nén `dist/` thành ZIP, upload rồi *Extract*.
   Repo có sẵn quy ước tạo file `zingplay-web-php-upload.zip` (xem `AI_RULES.md`).
3. Cấu trúc đúng sau khi giải nén:

```
public_html/zingplay/
├── .htaccess          (cache: index.html/js/css luôn kiểm tra lại, /assets/* cache 1 năm)
├── index.html
├── admin.html  admin.js  admin.css   (trang quản trị xu/tài khoản)
├── sounds/*.wav
└── assets/*.js *.css (có hash trong tên file)
```

`.htaccess` cần `mod_headers` + `mod_deflate` (bật mặc định trên hầu hết host cPanel) và cho phép `AllowOverride`.
Nếu host không cho phép, giao diện vẫn chạy; chỉ mất cấu hình cache (khi cập nhật hãy bấm tải lại mạnh `Ctrl+F5`).

## 3. API PHP và cơ sở dữ liệu

Xem `api_zingplay/README.md` và `HUONG_DAN_KET_NOI_DATABASE_GAME_ONLINE.md`. Tóm tắt:

1. Với database hiện có, sao lưu rồi nâng cấp schema trước khi cập nhật API.
   Nếu database chưa có schema realtime, chạy `api_zingplay/migrate_realtime.sql` trước.
   Sau đó chạy `sql/004_game_hub.sql` trong phpMyAdmin.
   script có thể chạy lại và thêm `game_type`, `game_state` cùng index cho bảng `game_rooms`.
   Database mới có thể import `api_zingplay/schema.sql`, đã bao gồm các cột này.
2. Giải nén `api_zingplay-php-upload.zip` trực tiếp vào `public_html/api_zingplay/`, bao gồm thư mục `games/`.
   Giữ `config/config.php` hiện có; ZIP không chứa file cấu hình bí mật này.
3. Sao chép `config/config.example.php` → `config/config.php`, nhập thông tin MySQL.
4. Tùy chọn trong `config/config.php`: `'long_poll' => true` để bật long-poll (giữ request tối đa 15 giây, kiểm tra
   mỗi 400ms). Mặc định tắt vì host dùng chung thường giới hạn số tiến trình PHP đồng thời.

Giao diện và API cùng domain nên không cần CORS. Nếu để chúng ở hai domain khác nhau, API chỉ cho phép
`localhost`/`127.0.0.1` và cùng origin — cần chỉnh `index.php` (xem hàm `route_request`).

## 4. Kiểm tra sau khi upload

1. Mở `https://blastbaal.id.vn/api_zingplay/health` → `{"status":"ok",…}`.
2. Mở `https://blastbaal.id.vn/zingplay/`, đăng nhập, chọn Xập Xám tại hub rồi bấm **Chơi nhanh**.
3. Mở trình duyệt/thiết bị khác với tài khoản khác và vào cùng bàn bằng mã. Chủ bàn có thể bắt đầu khi có ít nhất
   2 người; nếu đủ số ghế đã chọn, bàn tự bắt đầu. Xếp bài, bấm **Xong**, kiểm tra kết quả và ván tiếp theo.
4. Nếu giao diện báo *"Mất kết nối – đang thử lại…"*: kiểm tra mạng, địa chỉ `VITE_API_URL`, và file `.htaccess` của API.
5. Kiểm tra Tiến Lên theo `docs/TEST_CHECKLIST_C.md`; chế độ mock không hỗ trợ Tiến Lên.

Trò chuyện và biểu cảm online chưa được API PHP hỗ trợ. Việc kiểm thử cục bộ không thay thế kiểm tra trên
hosting và MySQL thực tế sau khi upload.
Nếu tài khoản báo đang ở trong phòng, dùng **Quay lại bàn cũ** tại sảnh hoặc hộp tạo/vào bàn.
Cần cập nhật cả giao diện và API PHP để dùng chức năng này; không cần đổi database.

## 5. Cập nhật phiên bản

Build lại → xóa nội dung cũ trong `public_html/zingplay/` (giữ `.htaccess` nếu đã tùy chỉnh) → upload bản mới.
File trong `assets/` đổi tên theo hash nên trình duyệt luôn nhận bản mới sau khi tải lại `index.html`.

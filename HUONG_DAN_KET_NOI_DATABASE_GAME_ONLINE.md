# Hướng dẫn triển khai API ZingPlay

Tài liệu này dành riêng cho game Binh Xập Xám trong `web/zingplay/`. Backend Node.js cần được triển khai riêng; GitHub Pages chỉ lưu trữ giao diện tĩnh.

## 1. Cấu trúc và luồng kết nối

```text
Trình duyệt
  ├── HTTPS /api/* ───────> api_zingplay ──> MySQL
  └── WSS ────────────────> api_zingplay (phòng và ván realtime)
```

- Mã backend có thể tải lên máy chủ nằm trong folder `api_zingplay/`.
- `schema.sql` tạo các bảng tài khoản, phiên đăng nhập và lịch sử ván hoàn thành.
- `web/zingplay/` là giao diện game; địa chỉ API mặc định là `https://blastbaal.id.vn/api`, WebSocket mặc định là `wss://blastbaal.id.vn/ws`.
- Không kết nối MySQL từ trình duyệt. Chỉ backend được cấp thông tin kết nối database.

## 2. API tài khoản

| Method | Đường dẫn | Dùng để |
| --- | --- | --- |
| `GET` | `/api/health` | Kiểm tra API và kết nối database |
| `POST` | `/api/auth/register` | Tạo tài khoản bằng số điện thoại và mật khẩu |
| `POST` | `/api/auth/login` | Đăng nhập bằng số điện thoại và mật khẩu |
| `GET` | `/api/auth/me` | Lấy tài khoản của bearer token hiện tại |
| `POST` | `/api/auth/logout` | Thu hồi phiên đăng nhập hiện tại |
| `GET` | `/api/matches` | Lịch sử các ván hoàn thành của tài khoản |

Ví dụ đăng ký hoặc đăng nhập:

```http
POST /api/auth/register
Content-Type: application/json

{"phone":"0912345678","password":"mat-khau-tu-8-ky-tu"}
```

Số Việt Nam dạng `09...` được chuẩn hóa sang `+84...`; cũng có thể gửi số dạng quốc tế. Mật khẩu dài 8–128 ký tự. Thành công trả JSON gồm `accessToken`, `expiresAt` và `user`. Gửi token ở header `Authorization: Bearer <accessToken>` cho các API cần đăng nhập và trong tin nhắn xác thực WebSocket đầu tiên.

Đây là đăng nhập **bằng mật khẩu**, không phải OTP: gửi mã SMS cần nhà cung cấp SMS và thông tin xác thực riêng; dự án hiện chưa cấu hình dịch vụ đó, nên việc đăng ký chưa xác minh quyền sở hữu số điện thoại. Mật khẩu được băm bằng scrypt; database chỉ lưu hash token phiên, không lưu token gốc.

## 3. Database `zingplay`

Database này chỉ lưu dữ liệu bền vững; bài đang chia và phòng chờ vẫn nằm trong RAM của Node.js.

| Bảng | Dữ liệu | Lý do |
| --- | --- | --- |
| `users` | ID, số điện thoại đã chuẩn hóa, tên hiển thị, salt/hash mật khẩu | Đăng ký và đăng nhập |
| `sessions` | Hash token, user, thời hạn | Xác thực API và WebSocket, thu hồi khi đăng xuất |
| `matches` | Mã ván/phòng, số người, thời điểm bắt đầu/kết thúc | Một bản ghi cho mỗi ván hoàn thành |
| `match_players` | Người chơi trong ván, tên snapshot, điểm, bài đã xếp, kết quả từng chi | Lịch sử; có thể tính bảng xếp hạng từ điểm |

Không cần bảng riêng cho bảng xếp hạng ban đầu: tổng điểm có thể truy vấn từ `match_players`. Chưa cần lưu phòng chờ, WebSocket token nguyên bản, bài đang chơi, bạn bè, vật phẩm hoặc tiền ảo. Ván chưa hoàn thành/hủy không được ghi vào lịch sử; nếu cần khôi phục ván sau khi server restart, cần thiết kế lưu trạng thái realtime riêng.

Tạo database mới:

```sql
CREATE DATABASE zingplay
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Chạy file schema từ thư mục gốc repo (thay host và tài khoản quản trị theo máy chủ của bạn):

```sh
mysql --host=DB_HOST --user=DB_ADMIN_USER --password zingplay < api_zingplay/schema.sql
```

Khi Node.js và MySQL cùng máy, có thể tạo tài khoản chạy ứng dụng riêng (đổi mật khẩu mẫu; nếu backend ở máy khác, thay `localhost` bằng host được phép kết nối):

```sql
CREATE USER 'zingplay_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_SECRET';
GRANT SELECT, INSERT, UPDATE, DELETE ON zingplay.* TO 'zingplay_app'@'localhost';
```

Không dùng tài khoản `root` cho ứng dụng. Đưa thông tin kết nối vào cấu hình môi trường của Node.js:

```text
PORT=8787
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=zingplay
DB_USER=<tai-khoan-game>
DB_PASSWORD=<mat-khau-database>
ALLOWED_ORIGINS=https://blastbaal.id.vn
```

`DB_USER` cần quyền `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên các bảng game; người chạy cài đặt schema cần thêm quyền tạo bảng. Thêm origin thật của trang giao diện vào `ALLOWED_ORIGINS`, phân cách bằng dấu phẩy nếu có nhiều origin. Không commit mật khẩu database vào Git và không mở cổng MySQL cho Internet.

## 4. Tải backend lên máy chủ

Máy chủ cần Node.js 20 trở lên và MySQL. Tải nguyên folder `api_zingplay/` lên máy chủ, cấu hình các biến môi trường ở trên, rồi:

```sh
cd api_zingplay
npm ci
npm start
```

Giữ tiến trình Node chạy bằng process manager phù hợp với máy chủ. Backend lắng nghe cổng nội bộ `8787`; không cần mở cổng này trực tiếp ra Internet nếu đã có reverse proxy HTTPS.

Ví dụ cấu hình Nginx cho cùng domain:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

Cấu hình chứng chỉ TLS cho domain ở reverse proxy và tiếp tục phục vụ giao diện web tại `location /` như hiện tại. Khi đó trình duyệt dùng HTTPS và WSS; không dùng `ws://` hoặc HTTP không mã hóa trên Internet. Nếu trang giao diện nằm ở domain khác, thêm chính xác origin HTTPS của trang đó vào `ALLOWED_ORIGINS`.

## 5. Kiểm tra sau triển khai

```sh
curl https://blastbaal.id.vn/api/health
```

Kết quả bình thường là JSON có `"status":"ok"`. Sau đó mở trang game, đăng ký bằng số điện thoại, đăng nhập, tạo phòng và vào phòng bằng một trình duyệt khác. API và phòng realtime cùng chạy trên một backend; không cần thêm dịch vụ Node thứ hai.

## 6. Giới hạn hiện tại

- Phòng và ván đang chơi nằm trong bộ nhớ; chúng mất khi Node khởi động lại và không được chia sẻ giữa nhiều tiến trình backend.
- Tài khoản, phiên đăng nhập và kết quả ván hoàn thành được lưu trong MySQL; phiên hết hạn sau 7 ngày.
- Game không có cược, tiền ảo hay quy đổi phần thưởng.
- Cấu hình production cần HTTPS/WSS, database riêng, backup, cập nhật dependencies và giới hạn truy cập máy chủ.

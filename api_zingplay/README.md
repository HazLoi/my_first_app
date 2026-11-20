# ZingPlay API — Binh Xập Xám

Backend Node.js cung cấp API tài khoản bằng số điện thoại và máy chủ WebSocket
cho game Binh Xập Xám 2–4 người. Giao diện nằm trong `web/zingplay/`; phòng
realtime và bài được xác minh ở backend. Không có cược, tiền ảo hay quy đổi
phần thưởng.

## Chạy thử trên máy

Yêu cầu Node.js 20 trở lên, MySQL và Python 3. Tạo database và chạy
[`schema.sql`](./schema.sql), sau đó cấu hình các biến:

```sh
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=zingplay
export DB_USER=zingplay
export DB_PASSWORD='your-local-password'
export ALLOWED_ORIGINS=http://localhost:8000
cd api_zingplay
npm install
npm start
```

Trong terminal khác, chạy giao diện:

```sh
python3 -m http.server 8000 --directory web
```

Mở `http://localhost:8000/zingplay/` ở hai cửa sổ trình duyệt. Giao diện mặc
định gọi API tại `http://localhost:8787/api` và WebSocket tại
`ws://localhost:8787/ws`. Đăng ký tài khoản, tạo phòng ở cửa sổ thứ nhất, đăng
nhập tài khoản khác ở cửa sổ thứ hai, nhập mã phòng rồi chủ phòng bấm
**Chia bài**.

## API tài khoản

Các endpoint có trong `server/index.js`:

- `POST /api/auth/register` và `POST /api/auth/login` nhận `{ "phone": "...", "password": "..." }`.
- `GET /api/auth/me` xác minh header `Authorization: Bearer <token>`.
- `POST /api/auth/logout` thu hồi phiên đăng nhập.
- `GET /api/matches` trả tối đa 50 ván hoàn thành gần nhất của người dùng.
- `GET /api/health` kiểm tra API và kết nối MySQL.

Số Việt Nam dạng `09...` được chuẩn hóa sang `+84...`. Mật khẩu dài từ 8 đến
128 ký tự và được băm bằng scrypt. Đăng nhập dùng mật khẩu, chưa tích hợp SMS
OTP. Phiên bearer ngẫu nhiên hết hạn sau 7 ngày; chỉ hash của token được lưu
trong database. Sau khi tất cả người chơi chốt bài, kết quả và các chi được
lưu giao dịch vào `matches` và `match_players`; `GET /api/matches` chỉ trả lịch
sử của tài khoản đang đăng nhập.

## Đưa lên máy chủ

Tải folder `api_zingplay/` lên máy chủ có Node.js 20 trở lên và MySQL. Chạy
[`schema.sql`](./schema.sql) trong database game, đặt các biến môi trường
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PORT` và
`ALLOWED_ORIGINS`, rồi chạy `npm ci && npm start`. Dùng reverse proxy TLS để
chuyển `/api/` và WebSocket về cổng nội bộ `8787`. Hướng dẫn từng bước và mẫu
Nginx có trong [`HUONG_DAN_KET_NOI_DATABASE_GAME_ONLINE.md`](../HUONG_DAN_KET_NOI_DATABASE_GAME_ONLINE.md).

Phòng đang chờ và ván chưa hoàn thành nằm trong bộ nhớ; tài khoản, phiên và ván
đã hoàn thành nằm trong MySQL. Không thể chạy nhiều tiến trình backend độc lập
mà không bổ sung kho trạng thái realtime chung.

## Luật MVP

- Dùng bộ bài 52 lá, chia 13 lá cho mỗi người.
- Xếp chi đầu 3 lá, chi giữa 5 lá, chi cuối 5 lá.
- Chi đầu chỉ tính mậu thầu, đôi và sám; sảnh/thùng không áp dụng cho chi 3 lá.
  Hai chi 5 lá dùng thứ tự poker chuẩn; A-2-3 là sảnh thấp.
- Chi giữa không được yếu hơn chi đầu; chi cuối không được yếu hơn chi giữa.
  Bài lủng không được chốt.
- Mỗi chi thắng một đối thủ được +1 điểm, thua được -1; thắng cả ba chi với
  cùng đối thủ được thêm 3 điểm. Hòa chi không cộng/trừ điểm.
- Điểm chỉ là kết quả ván chơi, không đại diện cho tiền hay tài sản.

## Kiểm tra

```sh
npm test
node --check server/index.js
node --check server/auth.js
node --check ../web/zingplay/game.js
```

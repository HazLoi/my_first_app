# Hướng dẫn triển khai ZingPlay bằng PHP

Backend game dùng **PHP 8.1+ và MySQL**. Không cần chạy Node.js, `npm install`,
WebSocket, VPS hay tạo subdomain. Hai thư mục trên cùng website được dùng riêng:

```text
Giao diện game: https://blastbaal.id.vn/zingplay/
API PHP:        https://blastbaal.id.vn/api_zingplay/
Database game:  adzuoqpv_zingplay

public_html/
├── api_zingplay/        API PHP của game này
└── zingplay/            giao diện game
```

Trình duyệt gửi thao tác lên PHP; PHP kiểm tra luật và ghi trạng thái phòng,
bài chia, bài chốt và kết quả vào MySQL. Trình duyệt hỏi trạng thái phòng mỗi
1,2 giây để cập nhật. Với game đánh theo lượt, cách này không cần một tiến trình
WebSocket chạy nền.

## 1. Kiểm tra cấu hình hosting

Trong cPanel, đảm bảo domain chạy **PHP 8.1 trở lên** và bật extension
**PDO MySQL (`pdo_mysql`)**. Backend Node cũ không còn được giao diện sử dụng.

Lịch sử trao đổi ghi nhận Node.js app `1111Q` đang gắn với URI `/` và cPanel
báo `Can't acquire lock`. Đừng chạy lại npm hoặc ghi đè ứng dụng đó để triển
khai PHP. Sau khi cài, nếu URL `/api_zingplay/health` vẫn trả về HTML/404, hãy
nhờ hosting kiểm tra Passenger của app Node có đang bắt đường dẫn này không.
Không sửa hoặc ghi đè `.htaccess` gốc của website.

## 2. Cập nhật giao diện game

Tải các file mới nhất từ thư mục `web/zingplay/` lên thư mục hiện có
`public_html/zingplay/`, ghi đè:

- `index.html`
- `game.js`
- `style.css`
- `admin.html`
- `admin.js`

Có thể dùng gói `zingplay-web-php-upload.zip` ở thư mục gốc repo (giải nén vào
`public_html/zingplay/`) và `api_zingplay-php-upload.zip` (giải nén vào
`public_html/api_zingplay/`). Hai gói này được tạo lại mỗi khi sửa giao diện/API.

## 3. Cài API PHP vào đúng thư mục

Tải nội dung mới nhất của `api_zingplay/php/` vào thư mục hiện có
`public_html/api_zingplay/` (không tạo thêm thư mục con `php/`).

Sau khi giải nén, cần có:

```text
public_html/api_zingplay/
├── .htaccess
├── index.php
├── bootstrap.php
├── rules.php
├── config/
│   ├── database.php
│   └── config.example.php
├── user/
│   └── routes.php
├── room/
│   └── routes.php
├── match/
│   └── routes.php
├── admin_api/
│   └── routes.php
├── reset_password.php
└── router.php
```

Trong `public_html/api_zingplay/config/`, sao chép `config.example.php` thành
`config.php`. Mở `config/config.php` và điền thông tin MySQL do hosting cấp:

```php
'db_host' => 'localhost',
'db_port' => 3306,
'db_name' => 'adzuoqpv_zingplay',
'db_user' => 'TEN_TAI_KHOAN_DATABASE',
'db_password' => 'MAT_KHAU_DATABASE',
```

Chỉ tải hoặc giải nén gói này vào `public_html/api_zingplay/`. Không gửi mật
khẩu database qua chat và không đưa `config/config.php` lên GitHub. `.htaccess`
tại `api_zingplay` chặn truy cập trực tiếp thư mục cấu hình và các file xử lý.
Nếu đã có `public_html/api_zingplay/config.php` từ bản cũ, bạn có thể sao chép
file đó vào `config/config.php`; khi chưa có file mới, API vẫn dùng file cũ.
Khi cả hai cùng tồn tại, API ưu tiên file trong `config/`. Gói ZIP không chứa
`config.php` nên không ghi đè mật khẩu đang có.

`bootstrap.php` nạp mã dùng chung; thư mục `user/` xử lý đăng ký, đăng nhập,
đăng xuất; `room/` xử lý phòng, `match/` xử lý lịch sử và `admin_api/` xử lý các API quản trị. Địa chỉ API hiện tại
như `/api_zingplay/auth/login` vẫn được giữ nguyên.

## 4. Tạo bảng cho phòng/ván

Trong cPanel → **phpMyAdmin**, chọn database `adzuoqpv_zingplay`, mở tab
**Import**, rồi nhập file [`api_zingplay/schema.sql`](api_zingplay/schema.sql).
File dùng `CREATE TABLE IF NOT EXISTS`: các bảng tài khoản, phiên và lịch sử
đang có sẽ không bị xóa; hai bảng `game_rooms` và `game_room_players` sẽ được
tạo để lưu các phòng đang chơi.

`schema.sql` hiện tại cũng bổ sung các cột xu, phòng công khai và realtime còn
thiếu cho bảng cũ; không cần các file migration cũ không còn trong repo. Hãy sao
lưu database trước khi nâng cấp. Các phòng cũ vẫn riêng tư; phòng mới chỉ xuất
hiện ở sảnh khi chủ phòng chọn công khai.

### Cấp quyền admin

Admin không tạo được qua web. Đăng ký tài khoản bình thường trên game, rồi chạy
trong phpMyAdmin (thay bằng số điện thoại của bạn, dạng `+84...`):

```sql
UPDATE users SET role = 'admin' WHERE phone = '+84912345678';
```

Đăng nhập lại, trang game sẽ có liên kết **QUẢN TRỊ** tới `/zingplay/admin.html`:
xem thống kê, tìm tài khoản, cộng/trừ xu, khóa/mở khóa, xem sổ xu và ván gần đây.

Tài khoản MySQL của PHP cần quyền `SELECT`, `INSERT`, `UPDATE`, `DELETE` trên
database game. Chỉ tài khoản quản trị dùng để import schema mới cần quyền tạo
bảng.

## 5. Kiểm tra API

Mở:

```text
https://blastbaal.id.vn/api_zingplay/health
```

Kết quả mong đợi:

```json
{"status":"ok","service":"api_zingplay_php","database":"ok"}
```

Nếu thấy lỗi JSON “Thiếu `config/config.php`”, kiểm tra tên và vị trí file config.
Nếu có lỗi database, kiểm tra thông tin đăng nhập, host và quyền của database
user. Nếu đường dẫn trả về trang HTML/404, kiểm tra `.htaccess` trong
`public_html/api_zingplay/` và hỏi hosting về Passenger; đừng đổi đường dẫn
`/api_zingplay`. Nếu hosting trả về trang kiểm tra truy cập thay vì JSON, nhờ
hosting cho phép các yêu cầu API đi qua lớp kiểm tra đó.

Nếu đăng ký báo thiếu bảng database, nhập `schema.sql` theo mục 4. Nếu báo
không thể truy cập database hoặc thiếu PDO MySQL, kiểm tra quyền tài khoản
database và extension PHP tương ứng. Thông báo “cấu trúc bảng không khớp”
cần được quản trị viên kiểm tra trước khi thay đổi các bảng đang có dữ liệu.

Nếu nút đăng ký bị vô hiệu hóa và trang báo không tải được chức năng đăng nhập,
kiểm tra `game.js` đã được tải đúng vào `public_html/zingplay/`, không bị trả
về trang HTML hay bị chặn bởi trình duyệt/hosting, rồi tải lại trang. Không
nhập lại mật khẩu vào URL. Nếu mật khẩu từng xuất hiện trên URL hoặc được chia
sẻ, hãy đổi mật khẩu đó và các tài khoản khác dùng chung mật khẩu.

## 6. Chơi thử

Mở `https://blastbaal.id.vn/zingplay/`, tạo tài khoản bằng số điện thoại và
mật khẩu, rồi mở cửa sổ riêng tư hoặc trình duyệt khác để đăng nhập tài khoản
thứ hai. Tạo phòng, nhập mã phòng ở cửa sổ kia, chủ phòng bấm **Chia bài**.
Phòng và ván chưa hoàn tất nay được lưu trong MySQL.

Đăng ký hiện dùng mật khẩu, **chưa có SMS OTP** để xác minh quyền sở hữu số
điện thoại. Mật khẩu không được để trống, tối đa 128 byte; mật khẩu ngắn dễ bị
đoán nên nên dùng mật khẩu dài và riêng cho game. Tài khoản mới nhận 10.000 xu ảo;
xu chỉ dùng trong game, không nạp, rút hay quy đổi thành tiền thật.

## 7. Tài khoản tạo bằng backend Node cũ

Backend Node trước đây băm mật khẩu bằng scrypt; PHP không thể xác minh các
hash đó bằng `password_verify()`. Dữ liệu tài khoản và lịch sử cũ vẫn được giữ,
nhưng tài khoản có hash Node cần quản trị viên đặt lại mật khẩu một lần bằng
Terminal của hosting:

```sh
cd /home/adzuoqpv/public_html/api_zingplay
php reset_password.php +84XXXXXXXXX
```

Thay số ví dụ bằng số điện thoại đã đăng ký. Script chỉ chạy từ CLI, yêu cầu
mật khẩu mới hai lần và thu hồi phiên cũ. Tài khoản mới tạo bằng PHP đăng nhập
bình thường.

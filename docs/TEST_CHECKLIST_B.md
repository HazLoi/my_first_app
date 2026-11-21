# Kiểm tra API Tiến Lên

1. Chạy migration `sql/004_game_hub.sql` nếu server chưa chạy; sao lưu trước khi triển khai.
2. Đăng nhập hai tài khoản đủ xu; tạo bàn `POST /rooms` với `game_type: "tienlen"`, vào bàn bằng tài khoản còn lại.
3. Chủ bàn gọi `POST /rooms/{code}/start`; poll `GET /rooms/{code}?game_type=tienlen`.
4. Kiểm tra mỗi tài khoản chỉ thấy 13 lá của mình, đối thủ chỉ có `cardCount`.
5. Hết thời gian chia, thử sai lượt, lá không sở hữu, bộ sai và bỏ khi dẫn: API phải báo lỗi.
6. Đánh lá bắt buộc, thử chặn/bỏ, kiểm tra vòng mới và `since_version`.
7. Để hết 3 lượt liên tiếp; xác nhận server tự chơi và ván kết thúc.
8. Kiểm tra summary: hạng, chặt/cóng/thối, số xu thực trả và tổng `chips` bằng 0.
9. Sau 3 giây poll để bắt đầu ván mới; kiểm tra người hết xu bị đưa ra và nhận thông báo.
10. Kiểm tra Xập Xám tạo bàn, chơi và polling như trước.

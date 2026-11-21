# Kiểm tra Tiến Lên trên server

1. Sao lưu database; chạy `sql/004_game_hub.sql` nếu chưa chạy, cập nhật cả hai ZIP vào đúng thư mục web và API.
2. Đăng nhập, chọn Tiến Lên; tạo bàn 2, 3 và 4 người, kiểm tra mức cược và số ghế.
3. Vào bàn bằng các tài khoản khác, bắt đầu hoặc đợi tự chia; mỗi người chỉ thấy bài của mình.
4. Kiểm tra bố trí ghế, tên, xu, chủ bàn và số lá còn lại.
5. Đánh nước đầu có lá bắt buộc; thử chọn bộ sai, bộ nhỏ và kiểm tra lý do khóa nút.
6. Đánh, bỏ lượt, kiểm tra người đã bỏ không đánh lại đến vòng mới.
7. Thử heo, đôi heo, tứ quý, 3/4 đôi thông và chặt theo cấu hình server.
8. Chạm và vuốt chọn nhiều lá; dùng Gợi ý, Xếp lại và thử trên điện thoại ngang.
9. Hết giờ lượt khi dẫn và khi chặn; sau ba lần liên tiếp kiểm tra server tự đánh.
10. Để người về nhất và các hạng còn lại; kiểm tra cóng, thối heo, tới trắng nếu xảy ra.
11. Kiểm tra tổng kết chi tiết và tổng xu cộng trừ bằng 0; ván sau tự bắt đầu sau 3 giây.
12. Tải lại trang và mất/kết nối lại giữa ván; bài, lượt và đồng hồ khôi phục đúng.
13. Vào bàn đang chơi còn ghế: chỉ xem, không thấy bài người khác, được chia bài ván sau; thử rời bàn khi đang xem.
14. Quay lại bàn cũ sau khi đã chọn game khác; kiểm tra Xập Xám vẫn chơi bình thường.
15. Tạo bàn Tiến Lên, mở “Cài đặt tính điểm”, thử Tính điểm/Tính xu, điểm đích 5–200 và các nút 10/20/30/50.
16. Chỉnh điểm hạng 2/3/4 người, điểm chặt, cóng, tới trắng và thối heo; tạo lại bàn bằng các cấu hình khác.
17. Nhấn “Luật bàn” ở tài khoản không phải chủ để kiểm tra thông tin cấu hình chỉ đọc.
18. Gửi API với scoringMode/range/bộ cấu hình sai; server phải trả lỗi tiếng Việt, không ghi cấu hình.
19. Chơi nhiều ván ở chế độ điểm, kiểm tra bảng góc cộng dồn điểm, thanh tiến độ và huy hiệu +/- chặt.
20. Khi có người chạm điểm đích, kiểm tra bảng kết thúc trận, cúp hạng nhất và đếm reset 15 giây.

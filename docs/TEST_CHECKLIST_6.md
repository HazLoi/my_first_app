# Kiểm tra giao diện ngang trên điện thoại

Đối chiếu tĩnh theo mã, chưa chạy trình duyệt: không tính vùng tai thỏ cụ thể; cần xác nhận trên máy thật. Stage dùng kích thước layout ổn định; popup dùng visualViewport, cách mép ít nhất 8px, body cuộn và header/footer không co. Khi nhập, theo yêu cầu chế độ gọn, footer Tạo/Hủy tạm ẩn và thay bằng Xong; sau blur footer trở lại.

| Layout (CSS px) | Stage scale tối đa | Popup bình thường / visualViewport cao 45% | Thẻ hub |
|---|---:|---|---|
| 740×360 | 0,333 | Đạt theo mã: 344px / 146px khả dụng | Đạt theo mã: 2 × 163px |
| 844×390 | 0,361 | Đạt theo mã: 374px / 159,5px khả dụng | Đạt theo mã: 2 × 186px |
| 915×412 | 0,381 | Đạt theo mã: 396px / 169,4px khả dụng | Đạt theo mã: 2 × 201px |
| 1024×600 | 0,533 | Đạt theo mã: 584px / 254px khả dụng | Đạt theo mã: 2 × 225px |
| 1280×720 | 0,667 | Đạt theo mã: 704px / 308px khả dụng | Đạt theo mã: 2 × 260px |
| 1920×1080 | 1 | Đạt theo mã: 1064px / 470px khả dụng | Đạt theo mã: 2 × 260px |

Ở 45%, chế độ gọn có nhãn, ô tối thiểu 44px và nút Xong 44px; scale nền không phụ thuộc visualViewport. Các kết quả là đối chiếu CSS/JS, không phải kết quả thử thiết bị, và phụ thuộc bàn phím Chrome báo đúng visualViewport.

## Thử thực tế
1. Mở `?debug=layout`, kiểm tra chỉ số; bỏ tham số thì không hiện khung debug.
2. Vào Tiến Lên → Tạo bàn: kiểm tra hai cột, header/footer, nền đặc, Tạo/Hủy và tóm tắt đích 20.
3. Bấm −/+, các chip 10/20/30/50/100; kiểm tra giới hạn 5–200 không mở bàn phím.
4. Chọn Nhập số khác, nhập sai rồi đúng; kiểm tra lỗi, nút Tạo bị khóa và Xong/Enter đóng bàn phím.
5. Focus Mật khẩu bàn: chỉ ô đang nhập, nhãn và Xong hiện trên bàn phím; nền không dịch/co và debug scale không đổi.
6. Mở Luật chi tiết, thử các mục thu gọn, nhập một giá trị, Mặc định và Quay lại; dữ liệu trước khi lưu được giữ đúng.
7. Chuyển Tính xu, kiểm tra mức cược, cảnh báo thiếu xu và tùy chọn bù; chuyển lại điểm không mất cài đặt.
8. Dùng Back điện thoại và Esc đóng popup mà không thoát game; kiểm tra popup mật khẩu bàn, luật bàn và xác nhận.
9. Mở chat trong cả hai game, nhập và đóng bàn phím, gửi tin; nền không dịch/co.
10. Xoay dọc/ngang khi popup mở và sau khi đóng bàn phím; kiểm tra stage, vùng an toàn và bố cục.
11. Quay lại Chọn game: các thẻ căn giữa, không cắt; thử cuộn ngang nếu có thêm thẻ; hai dải ngoài cùng gradient.
12. Thử lại đăng nhập, sảnh và bàn Xập Xám/Tiến Lên; xác nhận các popup cuộn và nút vẫn dùng được.

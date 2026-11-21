# Kiểm tra trên server (2–4 tài khoản)

1. Chạy lần lượt `sql/004_game_hub.sql`, `api_zingplay/migrate_realtime.sql`, `sql/005_points_chat_history.sql`; sao lưu dữ liệu trước.
2. Trên điện thoại ngang, kiểm tra chọn game/chọn bàn, vùng an toàn, toàn màn hình và thêm vào màn hình chính.
3. Rời bàn chờ: danh sách không còn bàn 0 người; sau khoảng 30 giây và một lượt mở danh sách, bàn bị xóa.
4. Ngừng polling trên một tài khoản hơn 45 giây; mở danh sách bằng tài khoản khác và kiểm tra ghế được giải phóng.
5. Hết xu dưới ngưỡng, đăng nhập/lấy tài khoản hoặc vào bàn: số dư lên 10.000, có thông báo và sổ cái.
6. Trợ giúp chọn bài: thử sảnh, đôi, sám, chặt, lá mờ, chọn tay, kéo-vuốt và bật/tắt; server vẫn từ chối nước sai.
7. Tạo bàn Tiến Lên tính điểm, thay cấu hình; các người chơi xem cùng luật bàn, không bị trừ xu.
8. Chơi nhiều ván, kiểm tra hạng, chặt, cóng, tới trắng, thối heo và tổng điểm theo luật đã chọn.
9. Chạm điểm đích, thử hòa và ván phụ; kiểm tra kết thúc trận, tự chơi trận mới và nút chủ bàn.
10. Rời bàn sau một ván đã xong; kiểm tra người rời, điểm giữ lại và trận dừng khi còn dưới 2 người.
11. Cả hai game: gửi chat, câu nhanh/emoji, tin của mình căn phải; kiểm tra người ngoài không đọc/gửi được.
12. Xóa bàn và xác nhận tin chat của bàn cũng bị xóa trong database.
13. Tại chọn game/chọn bàn mở Lịch sử: lọc game/tên, chuyển trang, xem từng ván, tổng, hạng và trạng thái dừng.
14. Kiểm tra không có bản ghi lịch sử trùng sau nhiều lượt poll/rời/dọn; kiểm tra giới hạn lưu trên bản sao dữ liệu.

# Kiểm tra game hub và Xập Xám

1. Đăng nhập bằng tài khoản hiện có; xác nhận màn đầu tiên là hub.
2. Xác nhận thẻ Tiến Lên hiện “Sắp ra mắt”, bị vô hiệu hóa và không vào được sảnh.
3. Chọn Xập Xám; xác nhận vào sảnh cũ, chọn nhanh/chơi với bạn/chọn bàn vẫn dùng được.
4. Tải lại trang, mở lại hub và chọn Xập Xám; kiểm tra lựa chọn lần trước đã được lưu.
5. Mở Chọn bàn; bàn công khai cũ vẫn hiện đúng số người, mức cược và trạng thái.
6. Tạo bàn Xập Xám công khai; kiểm tra `game_rooms.game_type = 'xapxam'`.
7. Tạo bàn riêng tư, chia sẻ mã và vào bằng mã/mật khẩu trên tài khoản khác.
8. Chơi trọn một ván như cũ: chia bài, xếp bài, chốt bài, hiện kết quả và thanh toán xu.
9. Để phase chuyển theo deadline; kiểm tra client tiếp tục nhận state qua polling.
10. Mở tài khoản cũ/bản client cũ; kiểm tra yêu cầu thiếu `game_type` vẫn vào Xập Xám.
11. Gọi list bàn với `game_type=xapxam`; xác nhận không lẫn bàn game khác.
12. Thử gửi `game_type=tienlen` khi tạo bàn; API từ chối vì game chưa phát hành.

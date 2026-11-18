# Không Chiến

Bộ sưu tập game chạy trên web bằng HTML, CSS và JavaScript thuần. Chiến dịch
bắn gà vẽ bằng Canvas 2D với phối cảnh và hình vector 2.5D; các trò chơi khác
dùng giao diện HTML/CSS nhẹ.

## Chế độ chơi

- **Chiến dịch offline:** chơi một mình, đàn gà xuất hiện theo đợt, độ khó tăng
  dần; bắn trứng, né đạn, dùng bom, nhặt vật phẩm, tạo combo và lưu kỷ lục trên
  thiết bị.
- **Đua né chướng ngại:** điều khiển xe qua ba làn, né vật cản trong 60 giây và
  lưu số vật cản đã vượt.
- **Giải đố 2048:** ghép các ô số; hỗ trợ phím mũi tên và nút điều khiển cảm ứng.
- **Chiến thuật theo lượt:** di chuyển trên bàn 5×5 và tấn công kẻ địch ở ô kề.
- **Thẻ bài sinh tồn:** chọn bài tấn công, phòng thủ hoặc hồi máu để vượt ba đợt.
- **Đấu trường online:** đang hiển thị là sắp ra mắt. Chế độ này cần backend
  riêng; các trò chơi hiện tại không kết nối mạng và GitHub Pages chỉ lưu trữ
  giao diện web.

Sau lần mở trang đầu tiên khi có mạng, Service Worker lưu bộ giao diện để có thể
mở và chơi các game offline trên cùng trình duyệt. Kỷ lục được lưu cục bộ trên
thiết bị; chưa có đồng bộ online, ghép trận hoặc xác thực điểm qua máy chủ.

## Chạy trên máy

```sh
python3 -m http.server 8000 --directory web
```

Mở `http://localhost:8000`. Dùng WASD/phím mũi tên để bay, giữ Space để bắn,
`P` hoặc `Esc` để tạm dừng. Trên điện thoại, kéo trong vùng chơi và giữ nút
**BẮN**; nút **BOM** dọn đàn gà hiện tại.

Các trò chơi khác có hướng dẫn điều khiển ngay trong màn chơi; 2048 dùng phím
mũi tên hoặc các nút trên màn hình.

## GitHub Pages

Workflow `.github/workflows/pages.yml` triển khai thư mục `web/` sau mỗi lần
push lên `main`. Trong GitHub, chọn **Settings → Pages → Source: GitHub
Actions**. Link game sau khi triển khai:

`https://hazloi.github.io/my_first_app/`

## Tham khảo thiết kế

Các ý tưởng về đợt địch tăng độ khó, nâng cấp, điểm cao và hỗ trợ nhiều người
được tham khảo ở mức khái quát; không sử dụng mã nguồn hay hình ảnh của game
khác:

- [Chicken Invaders 1 — trang chính thức](https://www.interactionstudios.com/chickeninvaders.php)
- [Chicken Invaders 4 — tính năng trên Steam](https://store.steampowered.com/app/301300/Chicken_Invaders_4_Ultimate_Omelette/)
- [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MDN: Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [MDN: WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

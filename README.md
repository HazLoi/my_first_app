# Không Chiến

Game bắn gà arcade chạy trên web bằng HTML, CSS và JavaScript thuần. Giao diện
chiến đấu vẽ bằng Canvas 2D với phối cảnh, lớp cảnh, ánh sáng và máy bay/gà
low-poly để tạo cảm giác 2.5D mà không cần tải mô hình nặng.

## Chế độ chơi

- **Chiến dịch offline:** chơi một mình, đàn gà xuất hiện theo đợt, độ khó tăng
  dần; bắn trứng, né đạn, dùng bom, nhặt vật phẩm, tạo combo và lưu kỷ lục trên
  thiết bị.
- **Đấu trường online:** đang hiển thị là sắp ra mắt. Chế độ này cần backend
  realtime riêng; GitHub Pages chỉ lưu trữ giao diện web.

Sau lần mở trang đầu tiên khi có mạng, Service Worker lưu bộ giao diện để có thể
mở và chơi chiến dịch offline trên cùng trình duyệt.

## Chạy trên máy

```sh
python3 -m http.server 8000 --directory web
```

Mở `http://localhost:8000`. Dùng WASD/phím mũi tên để bay, giữ Space để bắn,
`P` hoặc `Esc` để tạm dừng. Trên điện thoại, kéo trong vùng chơi và giữ nút
**BẮN**; nút **BOM** dọn đàn gà hiện tại.

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

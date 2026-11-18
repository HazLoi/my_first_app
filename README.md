# Không Chiến

Game máy bay chạy trực tiếp trên trình duyệt bằng HTML, CSS và JavaScript thuần.
Trang game không cần Flutter, cài package hay tải mô hình 3D lớn; hiện là game
2D giả lập chiều sâu, chơi đơn với đối thủ máy.

## Chạy trên máy

Mở terminal tại thư mục dự án và chạy:

```sh
python3 -m http.server 8000 --directory web
```

Sau đó mở `http://localhost:8000`.

## Đưa lên GitHub Pages

Workflow `.github/workflows/pages.yml` tự đăng nội dung thư mục `web/` lên
GitHub Pages sau mỗi lần push lên nhánh `main`. Trong GitHub, vào **Settings →
Pages** và chọn **Source: GitHub Actions**. Sau khi workflow chạy thành công,
game sẽ có tại:

`https://hazloi.github.io/my_first_app/`

## Điều khiển

- Máy tính: WASD hoặc phím mũi tên để bay; giữ Space để bắn.
- Điện thoại: kéo trong vùng chơi để điều khiển; giữ nút **BẮN** để khai hỏa.

## Giới hạn hiện tại

GitHub Pages chỉ phục vụ tệp tĩnh nên bản này chưa ghép trận hoặc chơi online
hai người. Multiplayer cần thêm một dịch vụ realtime riêng để tạo phòng và
đồng bộ vị trí, đạn, va chạm. Bản hiện tại chỉ còn source web và workflow Pages.

# Tiến Lên miền Nam — backend

- Bàn 2–4 người, mỗi người 13 lá; lá dư không dùng.
- Rank số nguyên 3–14 (14 = A), 2 = heo; chất `spades`, `clubs`, `diamonds`, `hearts`.
- Thứ tự: 3 đến A rồi 2; cùng rank: Bích < Chuồn < Rô < Cơ.
- Bộ hợp lệ: lẻ, đôi, sám, tứ quý, sảnh ít nhất 3 lá, đôi thông ít nhất 3 đôi.
  Sảnh và đôi thông không có 2. Cùng loại, cùng số lá: so lá lớn nhất.
- Mặc định 3 đôi thông chặt một heo; tứ quý chặt một/đôi heo hoặc 3 đôi thông;
  4 đôi thông chặt một/đôi heo, tứ quý hoặc 3 đôi thông.
  Bộ chặt cùng loại, cùng số lá cao hơn được chặt chồng.
- Bỏ lượt bị khóa tới vòng mới. Người đánh cuối dẫn vòng mới; nếu người đó đã hết bài,
  người còn bài tiếp theo theo chiều ghế dẫn vòng.
- Ván đầu dẫn bằng 3 Bích; nếu không có thì bằng lá nhỏ nhất đã chia.
  Ván sau người thắng dẫn nếu còn ở bàn và `winnerStarts` bật; nếu không dùng lá nhỏ nhất.
- `full`: tiếp tục đến một người còn bài; `first-only`: dừng khi có Nhất.
- Tới trắng kiểm tra ngay sau chia, ưu tiên cấu hình; cùng loại so lá cao nhất
  trong bộ tới trắng, nếu bằng nhau thì người ở ghế trước thắng.
  Tứ quý được tính là hai đôi trong điều kiện 6 đôi.
- Điểm mặc định theo hạng: 2 người +1/-1; 3 người +2/0/-2; 4 người +2/+1/-1/-2.
  `first-only`: mỗi đối thủ trả Nhất 1 bet. Tới trắng: mỗi đối thủ trả 3 bet.
- Cóng là chưa đánh lá nào; trả Nhất thêm 2 lần trị tuyệt đối điểm hạng bét.
  Heo đen 1 bet, heo đỏ 2 bet; đôi heo bằng tổng hai lá. Thối heo trả Nhất.
- Chốt từng khoản danh nghĩa rồi bù trừ theo người; giới hạn lỗ theo số dư,
  chia phần thực thu cho những người có lãi theo tỷ lệ, làm tròn về xu và tổng bằng 0.
  `details`/`uncapped` trong kết quả là trước giới hạn; `chips` là tiền thực nhận/trả.
  Ledger ghi `match_result` với mã ván trong `note`, không dùng lịch sử Xập Xám.

## Cấu hình `api_zingplay/php/games/tienlen/config.php`

| Khóa | Mặc định / ý nghĩa |
|---|---|
| `turnSeconds`, `timeoutLimit` | 20 giây; 3 lần liên tiếp thì bot đánh đến hết ván |
| `dealingSeconds`, `summarySeconds`, `autoStartSeconds` | 1, 3, 3 giây |
| `rankMode`, `rankPoints`, `firstOnlyPoints`, `winnerStarts` | Xếp đủ/đến Nhất; điểm và người mở ván sau |
| `whiteEnabled`, `whitePriority`, `whitePayment` | Bật; rồng, tứ quý 2, 6 đôi, 5 đôi thông, tứ quý 3; 3 bet |
| `chopRules`, `chopValues` | Ma trận chặt; heo đen/đỏ 1/2, tứ quý 4, 3/4 đôi thông 3/4 bet |
| `coldMultiplier`, `rottenTwosEnabled` | Cóng x2 điểm bét; bật thối heo |

## API

- Bật Tiến Lên trong `php/config/games.php` và catalog client `src/config/games.json`.
- Tạo bàn `POST /rooms` với `game_type: "tienlen"`; vào bàn `POST /rooms/join`;
  chủ bàn gọi `POST /rooms/{code}/start`.
- `GET /rooms/{code}?game_type=tienlen` trả bài riêng ở `cards`, số lá đối thủ ở
  `room.players[].cardCount`, cùng `turn`, `table`, `lastPlayer`, `passed`, `ranking`, `events`.
  `room.deadline` và `serverTime` là mili-giây UTC; `results` chỉ có ở summary.
- `POST /rooms/{code}/action` nhận `{"type":"play","cards":[{"rank":3,"suit":"spades"}]}`
  hoặc `{"type":"pass"}`. Lỗi dùng HTTP status và `error` tiếng Việt theo API hiện có.
- Poll dùng `since_version`/`wait` như cũ; request đến hạn mới thúc đẩy trạng thái.
  Bàn tự chơi còn ghế nhận người xem không có bài, tham gia từ ván tiếp theo;
  người rời ván được bot đánh tiếp.
- `chopRules` và `turnSeconds` được gửi trong snapshot để giao diện dùng đúng cấu hình server.
- Kiểm tra luật client: `node tests/run_tienlen_client.mjs` (Node hỗ trợ chạy TypeScript).

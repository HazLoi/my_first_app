# Chế độ tính điểm Tiến Lên

## Giả định cóng/ngộp

Trong giai đoạn 3, “giết ngộp/cóng” được hiểu là người vẫn còn nguyên 13 lá, chưa đánh lá nào khi một người khác đã hết bài. Người đó được tự động xếp hạng cuối, không tiếp tục đánh và chịu điểm phạt cóng. Các người còn lại tiếp tục đánh để xếp Nhì/Ba/Tư.

Nếu người còn lại đã đánh ít nhất một lá thì không coi là cóng; anh ta vẫn được người kế tiếp đánh/bỏ lượt cho đến khi hết bài.

## Chế độ trận

- `points`: không biến động xu, cộng điểm từng ván đến điểm đích do chủ bàn đặt.
- `coins`: giữ cơ chế thanh toán xu hiện tại.
- Bàn Tiến Lên mới và quick-play mặc định dùng `points`; quick-play không ghép vào bàn `coins`. Bàn cũ vẫn giữ chế độ đã lưu.
- Cấu hình chỉ chủ bàn sửa trước khi trận bắt đầu.
- Chặt đè mặc định `last-pays-all`: người bị chặt ở lớp cuối trả tổng giá trị các lớp cho người chặt cuối; các người bị chặt trước không trả. Một lớp tính như chặt thường. Có thể chọn `stack` để mỗi lớp trả riêng.
- Giá trị cơ sở: heo đen 1, heo đỏ 2, đôi heo bằng tổng hai lá, ba đôi thông 3, tứ quý 4, bốn đôi thông 5. Mặc định mỗi đơn vị bằng `pointsPerUnit = 2` điểm hoặc bằng tiền cược trong chế độ xu; điểm chặt có thể chỉnh riêng trong cài đặt bàn.
- Xu chặt được thanh toán sau các khoản khác của ván và giới hạn theo số dư còn lại; người chặt chỉ nhận số thực trả. Mặc định không yêu cầu người trước bù; tùy chọn `coverShortfallByEarlierVictims` cho phép họ bù theo thứ tự lớp gần cuối đến đầu. Các chuỗi xử lý theo thứ tự xuất hiện.
- Cùng điểm cao nhất sau khi chạm điểm đích thì mở một ván phụ cho những người bằng nhau. Sau 15 giây, hệ thống tự reset điểm khi trận kết thúc và bắt đầu trận mới nếu còn ít nhất 2 người.

## Lưu ý server

Server là nguồn sự thật. Snapshot chỉ cung cấp cấu hình và tổng điểm để client hiển thị; mọi điểm ván/chặt/cóng/tới trắng/thối heo đều được PHP tính lại và xác thực.

Lịch sử mới lưu trận Tiến Lên chế độ điểm khi hoàn thành hoặc dừng sau ít nhất một ván; ván đang chơi dở không tính. Chỉ lưu chi tiết tối đa 40 ván đầu, tổng điểm vẫn tính cả trận. Lịch sử ván Xập Xám hiện tại giữ riêng.

## Tham số

| Tham số | Mặc định | Miền |
|---|---:|---|
| Điểm đích | 20 | 5–200 |
| Hạng 2 người | 1, 0 | -50–50 |
| Hạng 3 người | 2, 1, 0 | -50–50 |
| Hạng 4 người | 3, 2, 1, 0 | -50–50 |
| Heo đen / đỏ | -2 / -4 | -50–0 |
| Ba đôi thông / tứ quý / bốn đôi thông | -6 / -8 / -10 | -50–0 |
| Cóng / tới trắng / thối heo | -3 / +2 mỗi đối thủ / theo heo | -50–50 |

Tới trắng: người thắng nhận điểm hạng nhất cộng bonus cho mỗi đối thủ; mỗi đối thủ nhận -2 điểm tới trắng và không nhận điểm hạng.

## Ví dụ

1. Bàn 4 người, A nhất, B nhì, C ba, D bét: A +3, B +2, C +1, D 0.
2. D chặn heo đỏ của C: C bị -4, D cộng +4 nếu `chopperGains` bật.
3. B tới trắng trong bàn 3 người: B nhận hạng nhất + bonus hai đối thủ = +6; A/C mỗi người -2.
4. A đánh heo đen, B chặt bằng ba đôi thông, C chặt đè bằng ba đôi thông lớn hơn: B trả C (1 + 3) × 2 = 8 điểm; A không mất điểm chặt. Với cược 100, B trả 400 xu; nếu B chỉ còn 150 xu thì C nhận 150 xu, hoặc A bù tối đa 250 xu nếu bật bù thiếu.
5. A đánh heo đỏ, B chặt bằng tứ quý, C chặt đè bằng bốn đôi thông: B trả C (2 + 4) × 2 = 12 điểm; A không mất điểm chặt.
6. A đánh heo đen, B chặt bằng tứ quý, C chặt đè bằng bốn đôi thông, D chặt đè bằng bốn đôi thông lớn hơn: C trả D (1 + 4 + 5) × 2 = 20 điểm; A và B không mất điểm chặt.

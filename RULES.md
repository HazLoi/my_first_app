# Luật ZingPlay — Binh Xập Xám (v2)

**PHP là nguồn sự thật**: `api_zingplay/php/rules.php` (luật, xáo bài, tới trắng, tự xếp) và
`api_zingplay/php/phase.php` (thời lượng các phase). Bản TypeScript (`src/config/rules.ts`,
`src/game-logic/`) chỉ dùng cho giao diện (nhãn, kiểm tra lủng, gợi ý, bot, mock) và phải cho kết quả
giống hệt PHP; `tests/vectors.json` (sinh bằng `php api_zingplay/php/tests/generate_vectors.php`) là bộ
kiểm chứng chung: mỗi nhóm có ≥ 100 ca (hands, compare, arrangements, white, scoring, shuffle, autoArrange).

## 1. Bộ bài, xáo, chia

- 52 lá. Thứ tự bộ bài gốc: ♣ `clubs`, ♦ `diamonds`, ♥ `hearts`, ♠ `spades`; mỗi chất giá trị 2..14
  (J=11, Q=12, K=13, A=14). Lá trên dây: `{"id":"clubs-7","suit":"♣","value":7,"label":"7"}`.
- Mỗi ván có **seed** = 32 ký tự hex thường (128 bit): `bin2hex(random_bytes(16))` (`zingplayNewSeed()`).
- Xáo `zingplayShuffleWithSeed(seed)` — Fisher–Yates với RNG xác định:
  - `counter` bắt đầu 0, tăng 1 sau mỗi lần lấy số;
  - `rand = u32 big-endian của 4 byte đầu của sha256(seed + ":" + counter)` (chuỗi ASCII, ví dụ `"00112233…eeff:0"`);
  - với `i` chạy từ **51 xuống 1**: `j = rand % (i + 1)` (chia lấy dư, chấp nhận lệch rất nhỏ), hoán đổi `deck[i]` và `deck[j]`.
  - Ví dụ (đã khóa trong test): seed `00112233445566778899aabbccddeeff` → 8 lá đầu
    `hearts-7, clubs-8, spades-3, spades-2, diamonds-4, spades-10, spades-4, clubs-12`.
- Chia: người thứ `i` (theo thứ tự ghế, bắt đầu 0) nhận `deck[i*13 .. i*13+12]`. Seed được lưu ở
  `game_rooms.seed`/`matches.seed` và trả về trong `results.seed` **sau khi** so bài (lộ seed trước đó là lộ bài).

## 2. Ba chi và các loại bài

Chi đầu 3 lá, chi giữa 5 lá, chi cuối 5 lá. **Binh lủng**: chi cuối phải ≥ chi giữa và chi giữa ≥ chi đầu
(so sánh bằng cùng quy tắc, chi 3 lá đệm 0 khi so với chi 5 lá); server từ chối bố cục lủng khi nộp
(`400 Binh lủng: …`).

| category | Loại (5 lá) | `label` | tieBreakers |
|---|---|---|---|
| 8 | Thùng phá sảnh | `Thùng phá sảnh X` (X = lá cao nhất) | `[lá cao nhất của sảnh]` (A-2-3-4-5 → 5) |
| 7 | Tứ quý | `Tứ quý X` | `[tứ quý, lá lẻ]` |
| 6 | Cù lũ | `Cù lũ X` (X = bộ ba) | `[bộ ba, đôi]` |
| 5 | Thùng | `Thùng X` (X = lá cao nhất) | 5 lá giảm dần |
| 4 | Sảnh | `Sảnh X` (X = lá cao nhất; A-2-3-4-5 là `Sảnh 5`, 10-J-Q-K-A là `Sảnh A`) | `[lá cao nhất]` |
| 3 | Sám cô | `Sám cô X` | giá trị các nhóm: bộ ba rồi hai lá lẻ giảm dần |
| 2 | Hai đôi | `Hai đôi X và Y` (X > Y) | `[đôi cao, đôi thấp, lá lẻ]` |
| 1 | Đôi | `Đôi X` | `[đôi, các lá lẻ giảm dần]` |
| 0 | Mậu thầu | `Mậu thầu X` (X = lá cao nhất) | 5 lá giảm dần |

Chi 3 lá chỉ có: Sám cô (category 3, tieBreakers `[X]`, nhãn `Sám cô X`), Đôi (category 1, `[đôi, lá lẻ]`),
Mậu thầu (category 0, 3 lá giảm dần). Chi 3 lá **không** có sảnh/thùng. Sảnh A-2-3-4-5 là sảnh thấp nhất
(thua 2-3-4-5-6); không có sảnh vòng (Q-K-A-2-3 không hợp lệ). So hai chi: category lớn hơn thắng, bằng nhau
thì so lần lượt `tieBreakers` (thiếu = 0); chất không phân biệt hơn thua (bằng nhau = hòa).
X dùng `2..10, J, Q, K, A`.

## 3. Tính điểm theo cặp

Mỗi cặp người chơi so từng chi. Thắng một chi được **1 điểm**, hoặc nhiều hơn nếu bài thắng đặc biệt
(giá trị tính theo bài của người thắng):

| Chi | Sám cô | Cù lũ | Tứ quý | Thùng phá sảnh |
|---|---|---|---|---|
| Đầu | 3 | 1 | – | – |
| Giữa | 1 | 2 | 8 | 10 |
| Cuối | 1 | 1 | 4 | 5 |

- `sum` của cặp = tổng điểm 3 chi (thắng dương, thua âm; hòa = 0).
- **Sập hầm**: thắng cả 3 chi một đối thủ → `multiplier = 2` cho cặp đó.
- **Sập làng**: (từ 3 người) thắng sập hầm **mọi** đối thủ → `multiplier` của mọi cặp của người đó nhân thêm 2
  (tổng ×4 cho từng cặp).
- Điểm cặp = `sum × multiplier`; `bonus` = phần cộng thêm do nhân (`sum × multiplier − sum`).
- `points` của người chơi = tổng điểm các cặp; tổng điểm của cả ván luôn bằng 0 (zero-sum).

### Ví dụ có số liệu (chạy thật từ `zingplayCompareResults`)

**Ví dụ 1 — sập hầm (2 người).** An: chi đầu `8♠8♥8♦` (Sám cô 8), giữa `10♠10♥4♦6♣7♠` (Đôi 10), cuối
`2♠2♥5♦7♣9♠` (Đôi 2). Bình: đầu `A♠A♥K♦` (Đôi A), giữa `9♠8♥6♦4♣2♠` (Mậu thầu 9), cuối `A♠K♥Q♦10♣8♠`
(Mậu thầu A). An thắng cả 3 chi: 3 (sám cô đầu) + 1 + 1 = 5; sập hầm ×2 → **An +10, Bình −10**
(`bonus` An +5).

**Ví dụ 2 — thắng/thua lẫn (2 người).** An: đầu `9♠7♥4♦`, giữa `10♠10♥3♣6♣8♠`, cuối `5♠5♥5♦5♣9♥` (Tứ quý 5).
Bình: đầu `8♠6♥3♦`, giữa `J♠J♥6♦4♣2♠`, cuối `A♠A♥A♦10♣8♥` (Sám cô A). Đầu: An thắng +1; giữa: Đôi J thắng Đôi 10 → −1;
cuối: tứ quý thắng sám cô, tứ quý cuối trị giá 4 → +4. `sum = 4`, không sập hầm → **An +4, Bình −4**.

**Ví dụ 3 — sập làng (3 người).** An (đầu A-K-2 → `K♠A♥2♦`, giữa Đôi K, cuối Cù lũ K), Bình (cùng dạng với 9),
Chi (cùng dạng với 5): mỗi người mạnh hơn người kia ở cả ba chi. Cặp An–Bình và An–Chi: `sum = 3`, sập hầm ×2,
sập làng ×2 → mỗi cặp 12. Cặp Bình–Chi: `sum = 3`, sập hầm ×2 → 6. Kết quả **An +24, Bình −6, Chi −18**
(`sapLang` của An = true; tổng 0).

**Ví dụ 4 — sập hầm nhưng không sập làng (3 người).** An: đầu `K♠K♥2♦`, giữa `10♠10♥10♦4♣7♠`, cuối `Q♠Q♥Q♦Q♣3♠`
(Tứ quý Q). Bình: đầu `9♠7♥3♦`, giữa `8♠8♥5♦6♣2♠`, cuối `J♠J♥9♥9♦4♠` (Hai đôi J và 9).
Chi: đầu `A♠A♥4♦`, giữa `J♠J♥J♦5♣3♠`, cuối `5♠6♥7♦8♣9♥` (Sảnh 9).
An thắng cả 3 chi của Bình (`1 + 1 + 4 = 6`, ×2 = 12) nhưng chỉ thắng 1 chi của Chi (`−1 − 1 + 4 = 2`, ×1).
Không sập làng vì An không sập hầm Chi. Kết quả **An +14, Bình −18, Chi +4**.

**Ví dụ 5 — quy đổi xu.** Mức cược 50 xu/điểm; điểm `[An +6, Bình +2, Chi −8]` = `[+300, +100, −400]` xu.
Nếu Chi chỉ còn 30 xu thì Chi chỉ trả tối đa 30 xu; 30 xu chia lại theo tỷ lệ 6 : 2 cho người thắng
(`zingplaySettleChips`): **An +23, Bình +7, Chi −30** (có test khóa). Tổng xu ván luôn bằng 0.

## 4. Tới trắng (bài thắng ngay)

Cấu hình: `ZINGPLAY_WHITE_ENABLED = true` (đặt `false` để tắt) và `ZINGPLAY_WHITE_TYPES`.
`zingplayDetectWhite(13 lá)` trả key có **rank cao nhất** mà bài thỏa (hoặc `null`).

| key | rank | điểm / đối thủ | nhãn | điều kiện (13 lá) |
|---|---|---|---|---|
| `rong_cuon` | 7 | 36 | Rồng cuốn | 13 lá cùng chất (A..K liền) |
| `sanh_rong` | 6 | 24 | Sảnh rồng | 13 rank khác nhau 2..A |
| `cung_mau_13` | 5 | 20 | 13 lá cùng màu | đỏ = ♦♥, đen = ♠♣ |
| `cung_mau_12` | 4 | 16 | 12 lá cùng màu | đúng 12 lá cùng màu, 1 lá khác màu |
| `sau_doi` | 3 | 12 | Sáu đôi | Σ ⌊số lá mỗi rank / 2⌋ ≥ 6 (tứ quý = 2 đôi; 5 đôi + 1 sám cô cũng thỏa) |
| `ba_sanh` | 2 | 10 | Ba sảnh | tách được 3+5+5 lá, mỗi nhóm là sảnh; sảnh 3 lá gồm A-2-3 và Q-K-A, **không** K-A-2; sảnh 5 lá A-2-3-4-5 và 10-J-Q-K-A hợp lệ |
| `ba_thung` | 1 | 8 | Ba thùng | tách được 3+5+5 lá, mỗi nhóm cùng chất: số lá theo chất ∈ {13}, {8,5}, {10,3}, {5,5,3} |

**Chấm điểm** (trong `zingplayCompareResults`; đầu vào mỗi người có thể truyền `white`, nếu không có khóa này
hàm tự dò bằng `zingplayDetectWhite` từ 13 lá đã xếp):

- Cặp (A, B) cả hai không trắng → chấm như mục 3.
- A trắng, B không → A thắng `points(A.white)` điểm; cặp có `white = true`, `multiplier = 1`; `leftWins/rightWins`
  của cặp = 0 nên **không** tạo sập hầm/sập làng (người trắng không bao giờ sập làng; người thua trắng
  vẫn được xét sập hầm/sập làng với các đối thủ khác).
- Cả hai trắng: rank cao hơn thắng `points(người thắng)`; bằng rank → hòa (0).
- Tổng điểm vẫn bằng 0. Người trắng **vẫn phải gửi bố cục hợp lệ** (không lủng); nếu chưa gửi, server tự xếp.

**Quy ước hiển thị `chi` (đã khóa bằng test)**: `wins/losses/ties` của từng chi chỉ đếm các cặp *không* trắng.
Nếu mọi cặp của người đó là cặp trắng (người trắng, hoặc người chỉ gặp đối thủ trắng) thì cả ba chi có:
`outcome = 'win'`, `label = 'Tới trắng'` khi tổng điểm trắng > 0; `outcome = 'loss'`, `label = 'Thua tới trắng'`
khi < 0; `outcome = 'tie'`, `label = 'Hòa tới trắng'` khi = 0. Người không trắng còn đối thủ không trắng khác
thì nhãn chi tính bình thường từ các cặp thường. `chi[pile].hand` luôn là nhãn bài đã xếp; `chi[pile].points`
chỉ gồm điểm chi của cặp thường. Hệ thức: `points = Σ chi.points + bonus + whitePoints`.

**Chi tiết từng cặp** `results[i].pairs[]`: `{opponentId, chi:{front,middle,back}, sum, multiplier, white, total, sapHam, swept}`
— tất cả theo góc nhìn của người sở hữu: `chi` là điểm gốc từng chi (**chưa nhân**), `sum` = tổng chi
(với cặp trắng: `chi` = 0 và `sum` = ± điểm tới trắng), `total = sum × multiplier` (điểm cuối của cặp),
`sapHam` = mình thắng cả 3 chi, `swept` = bị đối thủ sập hầm.

### Ví dụ tới trắng (số liệu chạy thật)

**Sáu đôi vs hai người thường.** Chi: `6♣6♦7♣7♥8♦8♠9♣9♥10♦10♠J♣J♥K♣` (6 đôi → Sáu đôi, 12 điểm/đối thủ).
An và Bình giữ nguyên bài ở Ví dụ 1 (An thắng Bình sập hầm +10). Chi thắng An 12 và Bình 12:
**Chi +24, An −12 + 10 = −2, Bình −12 − 10 = −22** (tổng 0; cặp An–Bình vẫn sập hầm, cặp có Chi không nhân).
`white` của Chi = `sau_doi`, `whitePoints` = 24, `bonus` = 0, `sapLang` = false; ba chi của Chi: `win` / `Tới trắng`.

**Trắng đối trắng.** Chi (Sáu đôi, rank 3) gặp Dũng (Sảnh rồng `2♣3♦4♥5♠6♣7♦8♥9♠10♣J♦Q♥K♠A♣`, rank 6):
Dũng thắng 24 điểm: **Dũng +24, Chi −24**; chi của Dũng `win/Tới trắng`, của Chi `loss/Thua tới trắng`.

## 5. Tự xếp bài (`zingplayAutoArrange`)

Dùng khi hết giờ xếp, khi người chơi rời giữa ván, hoặc cho bot; **luôn không lủng**, xác định (không ngẫu nhiên).
- Giá trị một chi: `value = category × 15⁵ + Σ tieBreakers[k] × 15^(4−k)` (tieBreakers đệm 0 đến 5 phần tử).
- Điểm một bố cục: `3 × value(chi cuối) + 2 × value(chi giữa) + 1 × value(chi đầu)`; chọn bố cục không lủng
  (`value(đầu) ≤ value(giữa) ≤ value(cuối)`) có điểm cao nhất.
- Quy ước để mọi cài đặt cho cùng kết quả: sắp 13 lá theo (value tăng, rồi ♣ < ♦ < ♥ < ♠), lá thứ `i` ứng với bit `i`;
  duyệt mask chi cuối (5 bit) **tăng dần**, với mỗi chi cuối duyệt mask chi giữa (5 bit trong 8 lá còn lại) **tăng dần**,
  chi đầu là 3 lá còn lại; chỉ thay bố cục tốt nhất khi điểm **lớn hơn hẳn**; `id` mỗi chi liệt kê theo thứ tự lá đã sắp.
- Hiệu năng: tiền tính giá trị 1287 tập 5 lá và 286 tập 3 lá, rồi so sánh số nguyên ≈ 72.000 tổ hợp.
  Đo thực tế (PHP CLI 8.4, 2000 ván ngẫu nhiên): trung bình ≈ 17 ms, chậm nhất ≈ 76 ms.

## 6. Xu, cược, nhịp ván

- Mức cược: 50/100/200/500/1000 xu/điểm; cần tối thiểu `20 × cược` để tạo/vào/chơi; tặng 10.000 xu khi đăng ký.
- Thanh toán `điểm × cược`; người thua chỉ trả tối đa số dư, tiền thắng chia lại theo tỷ lệ (có phần dư chia cho người
  có phần lẻ lớn nhất) để tổng xu mỗi ván bằng 0; số dư không bao giờ âm; mọi thay đổi ghi `wallet_transactions`.
- Phòng `auto_play`: `dealing` 3 s → `arranging` 60 s → `revealing` 9 s → `scoring` 3 s → `summary` 5 s → `next` 3 s
  → ván mới; tự bắt đầu 3 s sau khi đủ `max_players`; người không hoạt động > 45 s bị loại khi chia ván mới.

## 7. Tham số cấu hình (PHP ↔ TypeScript)

| Ý nghĩa | PHP (`rules.php` / `phase.php`) | TypeScript (`src/config/rules.ts`) |
|---|---|---|
| Mức cược | `ZINGPLAY_STAKES` | `STAKES` |
| Hệ số xu tối thiểu | `ZINGPLAY_MIN_BALANCE_MULTIPLIER` (20) | `MIN_BALANCE_MULTIPLIER` |
| Xu tặng đăng ký | `SIGNUP_BONUS` (`bootstrap.php`, 10.000) | `STARTING_BALANCE` |
| Điểm thắng chi đặc biệt | `zingplayChiValue()` | `RULES.chiPoints` |
| Hệ số sập hầm / sập làng, số người tối thiểu | `2` / `2` / `≥ 3` trong `zingplayCompareResults` | `RULES.sapHamMultiplier`, `RULES.sapLangMultiplier`, `RULES.sapLangMinPlayers` |
| Bật tới trắng | `ZINGPLAY_WHITE_ENABLED` | `RULES.white.enabled` |
| Bảng tới trắng (`rank`, `points`, `label`) | `ZINGPLAY_WHITE_TYPES` | `RULES.white.types` |
| Trọng số tự xếp (cuối 3, giữa 2, đầu 1) | `zingplayAutoArrange` | `RULES.suggest.weights` |
| Thời lượng phase (giây) | `ZINGPLAY_PHASE_SECONDS` (`dealing, arranging, revealing, scoring, summary, next`) | `RULES.phaseSeconds` |
| Trễ tự bắt đầu khi đủ người | `ZINGPLAY_PHASE_SECONDS['auto_start']` (3) | `RULES.autoStartDelaySeconds` |
| Ngưỡng loại người không hoạt động | `ZINGPLAY_PHASE_SECONDS['idle_kick']` (45) | – (chỉ server) |
| Giới hạn phòng không hoạt động | `ZINGPLAY_ROOM_IDLE_LIMIT` (1800 s) | – (chỉ server) |

Máy chủ có thể ghi đè thời lượng trong `config/config.php`: `'phase_seconds' => ['arranging' => 45, 'idle_kick' => 60]`
và bật `'long_poll' => true`. Đổi hằng luật (điểm, bảng tới trắng) phải đổi **cả hai bên** và sinh lại
`tests/vectors.json` rồi chạy bộ test của cả PHP lẫn TypeScript.

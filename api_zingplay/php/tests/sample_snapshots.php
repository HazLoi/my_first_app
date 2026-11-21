<?php
declare(strict_types=1);

// Sinh JSON mẫu thật cho docs/API_CURRENT.md (chạy trên harness, 2 người chơi, thời gian giả lập cố định).
require_once __DIR__ . '/harness.php';

$GLOBALS['ZINGPLAY_CONFIG'] = [];
zp_set_time(1_790_000_000);
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = ['00112233445566778899aabbccddeeff', 'ffeeddccbbaa99887766554433221100'];
$pdo = zp_fresh_database();
// Chữ ký phiên không phụ thuộc thời gian giả lập: đặt hạn dài.
$a = zp_register($pdo, '0911000001');
$b = zp_register($pdo, '0911000002');
$pdo->exec("UPDATE users SET display_name = CASE phone WHEN '+84911000001' THEN 'An' ELSE 'Bình' END");
$pdo->exec("UPDATE sessions SET expires_at = '2999-01-01 00:00:00'");

$print = static function (string $title, mixed $data, ?array $elide = null): void {
    if ($elide !== null && is_array($data)) {
        foreach ($elide as $key => $note) {
            $data[$key] = $note;
        }
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // Thu gọn mỗi lá bài về một dòng cho dễ đọc.
    $json = preg_replace('/\{\s+"id": ("[^"]+"),\s+"suit": ("[^"]+"),\s+"value": (\d+),\s+"label": ("[^"]+")\s+\}/u',
        '{"id": $1, "suit": $2, "value": $3, "label": $4}', $json);
    echo "#### $title\n\n```json\n$json\n```\n\n";
};
$api = static fn(string $method, string $route, array $user, ?array $body = null, array $query = []): array
    => zp_api($pdo, $method, $route, $user['token'], $body, $query)['body'];
$step = static function (array $user, string $code) use ($pdo, $api): array {
    zp_advance_time(max(0, (int)zp_room_row($pdo, $code)['phase_deadline'] - zingplay_now()));
    return $api('GET', '/rooms/' . $code, $user);
};

echo "### JSON mẫu thật theo từng phase\n\n";
echo "Các mẫu dưới đây do `api_zingplay/php/tests/sample_snapshots.php` chạy thật (2 người chơi An/Bình, mức cược 50, "
    . "thời gian giả lập). Mảng `cards`/`hands` hiển thị mỗi lá một dòng; chỗ ghi `\"…\"` là phần đã rút gọn cho dễ đọc.\n\n";

$created = zp_api($pdo, 'POST', '/rooms', $a['token'], ['autoPlay' => true, 'maxPlayers' => 2, 'isPublic' => true, 'stake' => 50]);
$code = $created['body']['room']['code'];
$print('`POST /rooms` → 201 (phase `waiting`, 1 người)', $created['body']);
$print('`GET /rooms/{code}?since_version=N` khi chưa có gì đổi', $api('GET', '/rooms/' . $code, $a, null, ['since_version' => $created['body']['version']]));
$joined = zp_api($pdo, 'POST', '/rooms/join', $b['token'], ['code' => $code]);
$print('Sau khi Bình vào (đủ `maxPlayers`): `phaseDeadline` = bây giờ + 3 giây', $joined['body']);
$print('`GET /rooms` (danh sách sảnh)', $api('GET', '/rooms', $b));
zp_advance_time(3);
$dealing = $api('GET', '/rooms/' . $code, $a);
$print('Phase `dealing` — snapshot của An (chỉ thấy bài của mình)', $dealing);
$arranging = $step($a, $code);
$submit = zp_submit_auto($pdo, $a, $code);
$print('Phase `arranging` — An đã chốt bài (Bình chưa): `submitted`, `arrangement`', $submit['body'], ['cards' => '… (13 lá như phase dealing)']);
$final = zp_submit_auto($pdo, $b, $code);
$print('Người cuối chốt bài → ngay lập tức sang `revealing` (An xem)', $api('GET', '/rooms/' . $code, $a));
$scoring = $step($a, $code);
$print('Phase `scoring` — `balance`/`players[].balance` vẫn là số dư TRƯỚC thanh toán', $scoring, [
    'results' => '… (như revealing)', 'cards' => '… (13 lá)', 'arrangement' => '… (3 chi)',
]);
$summary = $step($a, $code);
$print('Phase `summary` — số dư SAU thanh toán', $summary, [
    'results' => '… (như revealing)', 'cards' => '… (13 lá)', 'arrangement' => '… (3 chi)',
]);
$next = $step($a, $code);
$print('Phase `next` — đếm 3 giây rồi tự chia ván mới', $next, [
    'results' => '… (như revealing)', 'cards' => '… (13 lá)', 'arrangement' => '… (3 chi)',
]);

// Tới trắng.
$whiteSeed = null;
for ($i = 0; $i < 200000 && $whiteSeed === null; $i++) {
    $seed = hash('md5', 'doc-white-' . $i);
    $deck = zingplayShuffleWithSeed($seed);
    if (zingplayDetectWhite(array_slice($deck, 0, 13)) === 'sau_doi' && zingplayDetectWhite(array_slice($deck, 13, 13)) === null) {
        $whiteSeed = $seed;
    }
}
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = [$whiteSeed];
$a2 = zp_register($pdo, '0911000011');
$b2 = zp_register($pdo, '0911000012');
$pdo->exec("UPDATE users SET display_name = CASE phone WHEN '+84911000011' THEN 'Chi' ELSE 'Dũng' END WHERE phone IN ('+84911000011','+84911000012')");
$pdo->exec("UPDATE sessions SET expires_at = '2999-01-01 00:00:00'");
$room2 = zp_api($pdo, 'POST', '/rooms', $a2['token'], ['autoPlay' => true, 'maxPlayers' => 2, 'stake' => 50])['body']['room']['code'];
zp_api($pdo, 'POST', '/rooms/join', $b2['token'], ['code' => $room2]);
zp_advance_time(3);
$api('GET', '/rooms/' . $room2, $a2);
$step($a2, $room2);
zp_submit_auto($pdo, $a2, $room2);
zp_submit_auto($pdo, $b2, $room2);
$whiteView = $api('GET', '/rooms/' . $room2, $a2);
$print('Ván có tới trắng — `results` khi `revealing` (Chi: Sáu đôi, thắng 12 điểm; xem `pairs`)', $whiteView['results']);

// Khán giả và hủy ván.
$users = [zp_register($pdo, '0911000021'), zp_register($pdo, '0911000022'), zp_register($pdo, '0911000023'), zp_register($pdo, '0911000024')];
$pdo->exec("UPDATE sessions SET expires_at = '2999-01-01 00:00:00'");
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = [];
$room3 = zp_api($pdo, 'POST', '/rooms', $users[0]['token'], ['autoPlay' => true, 'maxPlayers' => 3, 'isPublic' => true])['body']['room']['code'];
zp_api($pdo, 'POST', '/rooms/join', $users[1]['token'], ['code' => $room3]);
zp_api($pdo, 'POST', '/rooms/' . $room3 . '/start', $users[0]['token']);
$spectatorSnap = zp_api($pdo, 'POST', '/rooms/join', $users[2]['token'], ['code' => $room3]);
$print('Khán giả vào giữa ván: `cards` = [], `spectator: true`', $spectatorSnap['body']);
zp_api($pdo, 'POST', '/rooms/' . $room3 . '/leave', $users[1]['token']);
$print('Còn dưới 2 người thật → hủy ván, về `waiting` kèm `cancelMessage`', $api('GET', '/rooms/' . $room3, $users[0]));
$quick = zp_api($pdo, 'POST', '/rooms/quick', $users[3]['token'], []);
$print('`POST /rooms/quick` (không có phòng phù hợp → tạo phòng công khai 4 người, 201)', $quick['body']);

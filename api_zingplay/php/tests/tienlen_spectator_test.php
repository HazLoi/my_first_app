<?php
declare(strict_types=1);
require_once __DIR__ . '/harness.php';

$GLOBALS['ZINGPLAY_CONFIG'] = [];
zp_set_time(time());
$pdo = zp_fresh_database();
[$a, $b, $c, $d] = zp_users($pdo, 4);
$create = zp_api($pdo, 'POST', '/rooms', $a['token'], [
    'game_type' => 'tienlen', 'autoPlay' => true, 'isPublic' => true, 'stake' => 50, 'maxPlayers' => 4,
]);
check($create['status'] === 201, 'Không tạo được bàn Tiến Lên.');
$code = $create['body']['room']['code'];
$join = static fn(array $user): array => zp_api($pdo, 'POST', '/rooms/join', $user['token'], ['code' => $code, 'game_type' => 'tienlen']);
check($join($b)['status'] === 200, 'Không vào được bàn.');
check(zp_api($pdo, 'POST', "/rooms/$code/start", $a['token'], [])['status'] === 200, 'Không bắt đầu được ván.');
$watch = $join($c);
check($watch['status'] === 200 && $watch['body']['cards'] === [], 'Khán giả không được xem bài.');
$player = array_values(array_filter($watch['body']['room']['players'], static fn(array $p): bool => $p['name'] === $c['name']))[0];
check($player['spectator'] === true && $player['cardCount'] === 0, 'Khán giả phải chờ ván sau.');
check(zp_api($pdo, 'POST', "/rooms/$code/action", $c['token'], ['type' => 'pass'])['status'] !== 200, 'Khán giả không được chơi.');
check(zp_api($pdo, 'POST', "/rooms/$code/leave", $c['token'], [])['status'] === 200, 'Khán giả phải rời được bàn.');
check($join($d)['status'] === 200, 'Ghế khán giả phải được giải phóng.');
$poll = static fn(array $user): array => zp_api($pdo, 'GET', "/rooms/$code", $user['token'], null, ['game_type' => 'tienlen']);
for ($i = 0; $i < 100 && zp_room_row($pdo, $code)['phase'] !== 'summary'; $i++) {
    $room = zp_room_row($pdo, $code);
    zp_advance_time(max(0, (int)$room['phase_deadline'] - zingplay_now()));
    check($poll($a)['status'] === 200, 'Không thể tiến ván qua polling.');
}
check(zp_room_row($pdo, $code)['phase'] === 'summary', 'Ván phải kết thúc.');
$room = zp_room_row($pdo, $code);
zp_advance_time(max(0, (int)$room['phase_deadline'] - zingplay_now()));
$next = $poll($d);
check($next['status'] === 200 && count($next['body']['cards']) === 13, 'Khán giả phải được chia bài ở ván sau.');
echo "Tiến Lên: kiểm tra khán giả đạt.\n";

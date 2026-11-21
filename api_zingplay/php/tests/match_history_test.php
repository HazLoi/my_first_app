<?php
declare(strict_types=1);

require_once __DIR__ . '/harness.php';

$GLOBALS['ZINGPLAY_CONFIG'] = ['gameplay' => ['history_retention_count' => 3]];
zp_set_time(time());
$pdo = zp_fresh_database();
[$a, $b, $visitor] = zp_users($pdo, 3);
$created = zp_api($pdo, 'POST', '/rooms', $a['token'], [
    'game_type' => 'tienlen', 'autoPlay' => true, 'isPublic' => true, 'maxPlayers' => 2,
    'targetScore' => 5, 'scoringConfig' => ['whiteEnabled' => false],
]);
check($created['status'] === 201, 'Tạo bàn thất bại.');
$code = $created['body']['room']['code'];
$rooms = zp_api($pdo, 'GET', '/rooms', $visitor['token'], null, ['game_type' => 'tienlen']);
check($rooms['body']['rooms'][0]['scoringMode'] === 'points', 'Danh sách phải cho biết bàn tính điểm.');
check(zp_api($pdo, 'POST', '/rooms/join', $b['token'], ['code' => $code, 'game_type' => 'tienlen'])['status'] === 200, 'Vào bàn thất bại.');
check(zp_api($pdo, 'POST', "/rooms/$code/start", $a['token'])['status'] === 200, 'Bắt đầu thất bại.');

$finishRound = static function (int $initialScore) use ($pdo, $code, $a): array {
    $room = zp_room_row($pdo, $code);
    $state = json_decode($room['game_state'], true, 512, JSON_THROW_ON_ERROR);
    [$first, $second] = $state['order'];
    $card = ['rank' => 3, 'suit' => 'spades'];
    $state['hands'][$first] = [$card];
    $state['hands'][$second] = [['rank' => 4, 'suit' => 'spades']];
    $state['turn'] = $first;
    $state['required'] = null;
    $state['table'] = null;
    $state['played'] = [$first => true, $second => true];
    $state['whiteWinner'] = null;
    $state['matchTotals'][$first] = $initialScore;
    $pdo->prepare("UPDATE game_rooms SET phase = 'playing', phase_deadline = ?, game_state = ? WHERE code = ?")
        ->execute([zingplay_now() + 20, zingplay_json($state), $code]);
    $result = zp_api($pdo, 'POST', "/rooms/$code/action", $a['token'], ['type' => 'play', 'cards' => [$card]]);
    check($result['status'] === 200, 'Đánh kết thúc ván thất bại: ' . json_encode($result));
    return json_decode(zp_room_row($pdo, $code)['game_state'], true, 512, JSON_THROW_ON_ERROR);
};

$state = $finishRound(4);
check($state['matchEnded'] && $state['historySaved'], 'Trận chạm đích phải lưu.');
check((int)$pdo->query('SELECT COUNT(*) FROM match_history')->fetchColumn() === 1, 'Lưu đúng một lần.');
$list = zp_api($pdo, 'GET', '/history.php', $visitor['token'], null, ['action' => 'list', 'name' => $a['name'], 'game_type' => 'tienlen']);
check($list['status'] === 200 && count($list['body']['matches']) === 1, 'Người đăng nhập xem và lọc lịch sử.');
$match = $list['body']['matches'][0];
check($match['status'] === 'finished' && count($match['rounds']) === 1
    && $match['rounds'][0]['points'] === [1, 0] && $match['players'][0]['user_id'] === $a['id'],
    'Lịch sử có điểm từng ván và danh tính.');
check(zp_api($pdo, 'GET', '/history.php', $visitor['token'], null, ['action' => 'detail', 'id' => $match['id']])['status'] === 200, 'Xem chi tiết.');
check(zp_api($pdo, 'GET', '/history.php')['status'] === 401, 'Lịch sử cần đăng nhập.');
check(zp_api($pdo, 'GET', '/history.php', $visitor['token'], null, ['name' => '%'])['body']['matches'] === [], 'Ký tự tìm kiếm không phải wildcard.');

check(zp_api($pdo, 'POST', "/rooms/$code/start", $a['token'])['status'] === 200, 'Bắt đầu trận mới.');
$state = $finishRound(0);
check(!$state['matchEnded'], 'Ván dưới điểm đích chưa kết thúc trận.');
zp_advance_time(3);
check(zp_api($pdo, 'GET', "/rooms/$code", $a['token'], null, ['game_type' => 'tienlen'])['body']['room']['phase'] === 'dealing',
    'Bắt đầu ván tiếp theo.');
check(zp_api($pdo, 'POST', "/rooms/$code/leave", $b['token'])['status'] === 200, 'Rời bàn thất bại.');
$state = json_decode(zp_room_row($pdo, $code)['game_state'], true, 512, JSON_THROW_ON_ERROR);
check($state['historySaved'] && $state['matchEnded'], 'Còn một người phải lưu trận dừng.');
$saved = $pdo->query("SELECT * FROM match_history WHERE status = 'abandoned'")->fetch();
check($saved && count(decode_json($saved['rounds_json'])) === 1
    && decode_json($saved['players_json'])[1]['left'], 'Lịch sử dừng có đúng ván và người đã rời.');
zp_advance_time(31);
zp_api($pdo, 'POST', "/rooms/$code/leave", $a['token']);
cleanup_rooms($pdo);
zp_advance_time(31);
cleanup_rooms($pdo);
check(zp_room_row($pdo, $code) === null && (int)$pdo->query('SELECT COUNT(*) FROM match_history')->fetchColumn() === 2,
    'Dọn bàn không ghi lịch sử trùng.');

$GLOBALS['ZINGPLAY_CONFIG']['gameplay']['history_page_size'] = 2;
for ($i = 0; $i < 3; $i++) {
    $state['historyId'] = new_id();
    $state['historySaved'] = false;
    zp_advance_time(1);
    $pdo->beginTransaction();
    save_tienlen_history($pdo, ['scoring_mode' => 'points', 'target_score' => 5], $state, 'abandoned', zingplay_now());
    $pdo->commit();
}
check((int)$pdo->query('SELECT COUNT(*) FROM match_history')->fetchColumn() === 3, 'Giới hạn lưu trận.');
$first = zp_api($pdo, 'GET', '/history.php', $visitor['token'], null, ['page' => 1])['body'];
$second = zp_api($pdo, 'GET', '/history.php', $visitor['token'], null, ['page' => 2])['body'];
check(count($first['matches']) === 2 && $first['hasMore']
    && count($second['matches']) === 1 && !$second['hasMore'], 'Phân trang không trùng.');
$pdo->exec("UPDATE match_history SET ended_at = '2000-01-01 00:00:00'");
$state['historyId'] = new_id();
$state['historySaved'] = false;
$pdo->beginTransaction();
save_tienlen_history($pdo, ['scoring_mode' => 'points', 'target_score' => 5], $state, 'abandoned', zingplay_now());
$pdo->commit();
check((int)$pdo->query('SELECT COUNT(*) FROM match_history')->fetchColumn() === 1, 'Xóa lịch sử quá hạn.');

$emptyPdo = zp_fresh_database();
[$firstUser, $secondUser] = zp_users($emptyPdo, 2, 20);
$newRoom = zp_api($emptyPdo, 'POST', '/rooms', $firstUser['token'], [
    'game_type' => 'tienlen', 'autoPlay' => true, 'maxPlayers' => 2,
    'scoringConfig' => ['whiteEnabled' => false],
]);
$newCode = $newRoom['body']['room']['code'];
zp_api($emptyPdo, 'POST', '/rooms/join', $secondUser['token'], ['code' => $newCode, 'game_type' => 'tienlen']);
zp_api($emptyPdo, 'POST', "/rooms/$newCode/start", $firstUser['token']);
zp_api($emptyPdo, 'POST', "/rooms/$newCode/leave", $secondUser['token']);
check((int)$emptyPdo->query('SELECT COUNT(*) FROM match_history')->fetchColumn() === 0,
    'Không lưu trận chưa hoàn thành ván nào.');

echo "Lịch sử trận: kiểm tra vòng đời, API và dọn bàn đạt.\n";

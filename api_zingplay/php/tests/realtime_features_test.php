<?php
declare(strict_types=1);

// Kịch bản chức năng cho phòng thời gian thực (auto_play). Chạy: php tests/realtime_features_test.php
// Dùng MariaDB nếu đặt ZP_MYSQL_DSN, ngược lại SQLite (xem harness.php).

require_once __DIR__ . '/harness.php';

$passed = 0;
$assert = static function (bool $condition, string $message) use (&$passed): void {
    check($condition, $message);
    $passed++;
};

$T0 = time();
$fresh = static function () use ($T0): PDO {
    $GLOBALS['ZINGPLAY_CONFIG'] = [];
    $GLOBALS['ZINGPLAY_SEED_QUEUE'] = [];
    zp_set_time($T0);
    return zp_fresh_database();
};
$poll = static fn(PDO $pdo, array $user, string $code, array $query = []): array
    => zp_api($pdo, 'GET', '/rooms/' . $code, $user['token'], null, $query);
$createAuto = static function (PDO $pdo, array $host, array $extra = []): array {
    $response = zp_api($pdo, 'POST', '/rooms', $host['token'], $extra + ['autoPlay' => true, 'isPublic' => true, 'stake' => 50]);
    check($response['status'] === 201, 'Tạo phòng thất bại: ' . json_encode($response['body'], JSON_UNESCAPED_UNICODE));
    return $response['body'];
};
$join = static fn(PDO $pdo, array $user, string $code, ?string $password = null): array
    => zp_api($pdo, 'POST', '/rooms/join', $user['token'], ['code' => $code] + ($password === null ? [] : ['password' => $password]));
$phaseOf = static fn(PDO $pdo, array $user, string $code): string
    => $poll($pdo, $user, $code)['body']['room']['phase'];
// Đi tới hạn phase hiện tại rồi poll để chuyển.
$stepPhase = static function (PDO $pdo, array $user, string $code) use ($poll): array {
    $room = zp_room_row($pdo, $code);
    $delta = max(0, (int)$room['phase_deadline'] - zingplay_now());
    zp_advance_time($delta);
    return $poll($pdo, $user, $code);
};
$keepAlive = static function (PDO $pdo, array $users, string $code) use ($poll): void {
    foreach ($users as $user) {
        $poll($pdo, $user, $code);
    }
};

// ---------------------------------------------------------------- 1. Tạo phòng, xác thực đầu vào
$pdo = $fresh();
[$a, $b, $c, $d] = zp_users($pdo, 4);
$assert(zp_api($pdo, 'GET', '/rooms/current')['status'] === 401, 'Tìm phòng hiện tại cần đăng nhập.');
$assert(zp_api($pdo, 'GET', '/rooms/current', $a['token'])['body']['code'] === null, 'Chưa ở phòng nào.');
foreach ([
    ['maxPlayers' => 1], ['maxPlayers' => 5], ['maxPlayers' => '4'], ['password' => ''], ['password' => str_repeat('x', 33)],
    ['password' => 123], ['autoPlay' => 'yes'],
] as $bad) {
    $assert(zp_api($pdo, 'POST', '/rooms', $a['token'], $bad)['status'] === 400, 'Tham số tạo phòng sai phải bị 400: ' . json_encode($bad));
}
$snapshot = $createAuto($pdo, $a, ['maxPlayers' => 3]);
$code = $snapshot['room']['code'];
$assert(zp_api($pdo, 'GET', '/rooms/current', $a['token'])['body']['code'] === $code, 'Chủ phòng tìm lại được phòng.');
$assert(zp_api($pdo, 'GET', '/rooms/current', $b['token'])['body']['code'] === null, 'Không lộ mã phòng của người khác.');
$assert($snapshot['room']['autoPlay'] === true && $snapshot['room']['maxPlayers'] === 3
    && $snapshot['room']['phase'] === 'waiting' && $snapshot['room']['hasPassword'] === false
    && $snapshot['room']['phaseDeadline'] === null && $snapshot['room']['round'] === 0, 'Snapshot phòng mới.');
$assert($snapshot['serverTime'] === $T0 * 1000 && is_int($snapshot['version']) && $snapshot['version'] >= 1, 'serverTime và version.');
$assert($snapshot['room']['players'][0]['seat'] === 1 && $snapshot['room']['players'][0]['balance'] === 10000
    && $snapshot['room']['players'][0]['spectator'] === false && $snapshot['room']['players'][0]['left'] === false, 'Trường người chơi.');
$assert($snapshot['cards'] === [] && $snapshot['results'] === null, 'Chưa có bài khi waiting.');
$assert(zp_api($pdo, 'POST', '/rooms', $a['token'], ['autoPlay' => true])['status'] === 409, 'Không tạo phòng thứ hai khi đang ở phòng.');
$assert($join($pdo, $b, $code)['status'] === 200, 'Vào phòng.');
$assert($poll($pdo, $a, $code)['body']['room']['phaseDeadline'] === null, 'Chưa đủ người thì không có hạn tự bắt đầu.');
$assert($join($pdo, $c, $code)['body']['room']['phaseDeadline'] === ($T0 + 3) * 1000, 'Đủ max_players → hẹn tự bắt đầu sau 3s.');
$assert($join($pdo, $d, $code)['status'] === 409, 'Phòng 3 người không nhận người thứ 4.');
$left = zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $c['token']);
$assert($left['status'] === 200 && $left['body']['cancelled'] === false, 'Rời phòng chờ.');
$assert(zp_api($pdo, 'GET', '/rooms/current', $c['token'])['body']['code'] === null, 'Người đã rời không còn phòng hiện tại.');
$assert($poll($pdo, $a, $code)['body']['room']['phaseDeadline'] === null, 'Thiếu người thì xóa hạn tự bắt đầu.');
$assert($poll($pdo, $c, $code)['status'] === 403, 'Người đã rời nhận 403.');

// ---------------------------------------------------------------- 2. Mật khẩu bàn
$pdo = $fresh();
[$a, $b, $c] = zp_users($pdo, 3);
$snapshot = $createAuto($pdo, $a, ['password' => 'bi-mat']);
$code = $snapshot['room']['code'];
$assert(zp_api($pdo, 'GET', '/rooms/current', $a['token'])['body']['code'] === $code, 'Tìm lại phòng có mật khẩu không cần vào lại.');
$assert($snapshot['room']['hasPassword'] === true, 'hasPassword.');
$wrong = $join($pdo, $b, $code, 'sai');
$assert($wrong['status'] === 403 && $wrong['body']['error'] === 'Sai mật khẩu bàn.', 'Sai mật khẩu → 403.');
$assert($join($pdo, $b, $code)['status'] === 403, 'Thiếu mật khẩu → 403.');
$assert($join($pdo, $b, $code, 'bi-mat')['status'] === 200, 'Đúng mật khẩu vào được.');
$assert(zp_api($pdo, 'POST', '/rooms/quick', $c['token'], [])['body']['room']['code'] !== $code, 'Quick-play bỏ qua phòng có mật khẩu.');

// ---------------------------------------------------------------- 3. Vòng đời một ván (4 người)
$pdo = $fresh();
$users = zp_users($pdo, 4);
[$a, $b, $c, $d] = $users;
$startTotal = zp_total_balance($pdo);
$code = $createAuto($pdo, $a)['room']['code'];
foreach ([$b, $c] as $user) {
    $join($pdo, $user, $code);
}
$version0 = $poll($pdo, $a, $code)['body']['version'];
$join($pdo, $d, $code);
$assert($poll($pdo, $a, $code)['body']['version'] > $version0, 'Join làm tăng version.');
$assert($poll($pdo, $a, $code)['body']['room']['phase'] === 'waiting', 'Chưa tới hạn thì vẫn waiting.');
zp_advance_time(2);
$assert($phaseOf($pdo, $a, $code) === 'waiting', 'Còn 1 giây vẫn waiting.');
zp_advance_time(1);
$dealing = $poll($pdo, $a, $code)['body'];
$assert(zp_api($pdo, 'GET', '/rooms/current', $a['token'])['body']['code'] === $code, 'Tìm lại phòng đang chơi.');
$assert($dealing['room']['phase'] === 'dealing' && $dealing['room']['round'] === 1
    && $dealing['room']['started'] === true && $dealing['room']['phaseDeadline'] === (zingplay_now() + 3) * 1000, 'Tự chia bài đúng sau 3s.');
$assert(count($dealing['cards']) === 13 && $dealing['results'] === null && $dealing['submitted'] === false, 'Có đúng 13 lá, chưa có kết quả.');
$otherIds = [];
foreach ([$b, $c, $d] as $user) {
    $other = $poll($pdo, $user, $code)['body'];
    $assert(count($other['cards']) === 13, 'Mỗi người nhận 13 lá.');
    $otherIds[] = array_column($other['cards'], 'id');
    $assert(array_intersect(array_column($other['cards'], 'id'), array_column($dealing['cards'], 'id')) === [], 'Bài các người không trùng nhau.');
}
$encoded = json_encode($dealing, JSON_UNESCAPED_UNICODE);
foreach ($otherIds as $ids) {
    foreach ($ids as $id) {
        $assert(!str_contains($encoded, '"' . $id . '"'), 'Snapshot không lộ bài người khác (' . $id . ').');
    }
}
$early = zp_submit_auto($pdo, $a, $code);
$assert($early['status'] === 409, 'Không nộp bài được ở phase dealing.');
$assert($stepPhase($pdo, $a, $code)['body']['room']['phase'] === 'arranging', 'dealing → arranging.');
$arranging = $poll($pdo, $a, $code)['body'];
$assert($arranging['room']['phaseDeadline'] === (zingplay_now() + 60) * 1000, 'Hạn xếp bài 60s.');
// Bốn người nộp: ba người đầu chưa kết thúc, người cuối kích hoạt revealing ngay trong cùng request.
foreach ([$a, $b, $c] as $user) {
    $submit = zp_submit_auto($pdo, $user, $code);
    $assert($submit['status'] === 200 && $submit['body']['room']['phase'] === 'arranging' && $submit['body']['results'] === null,
        'Chưa đủ người nộp thì vẫn arranging và chưa có kết quả.');
}
$assert(zp_submit_auto($pdo, $a, $code)['status'] === 409, 'Không nộp hai lần.');
$balancesBefore = array_map(static fn(array $user): int => zp_balance($pdo, $user['id']), $users);
$last = zp_submit_auto($pdo, $d, $code);
$assert($last['status'] === 200 && $last['body']['room']['phase'] === 'revealing', 'Người cuối nộp xong → revealing ngay.');
$results = $last['body']['results'];
$assert($results !== null && $results['round'] === 1 && preg_match('/^[0-9a-f]{32}$/', $results['seed']) === 1
    && count($results['players']) === 4 && $results['stake'] === 50, 'Kết quả có round và seed.');
$assert(array_sum(array_column($results['players'], 'points')) === 0 && array_sum(array_column($results['players'], 'chips')) === 0,
    'Điểm và xu mỗi ván cộng bằng 0.');
foreach ($results['players'] as $result) {
    $assert(isset($result['balanceBefore'], $result['balanceAfter'], $result['pairs']) && array_key_exists('white', $result)
        && array_key_exists('whiteLabel', $result)
        && count($result['pairs']) === 3, 'Kết quả đủ trường balanceBefore/After/pairs/white.');
    $assert($result['balanceBefore'] + $result['chips'] === $result['balanceAfter'], 'balanceAfter = before + chips.');
}
$expectedDeck = zingplayShuffleWithSeed($results['seed']);
foreach ($users as $index => $user) {
    $self = $poll($pdo, $user, $code)['body'];
    $assert(array_column($self['cards'], 'id') === array_column(array_slice($expectedDeck, $index * 13, 13), 'id'),
        'Bài chia đúng theo seed và thứ tự ghế.');
    // Trong revealing số dư trả về là số dư TRƯỚC thanh toán.
    $assert($self['balance'] === $balancesBefore[$index], 'Số dư top-level trước thanh toán trong revealing.');
    foreach ($self['room']['players'] as $listed) {
        $assert($listed['balance'] === 10000, 'players[].balance trước thanh toán trong revealing.');
    }
}
$assert($poll($pdo, $a, $code)['body']['historySaved'] === true, 'historySaved.');
$matches = zp_api($pdo, 'GET', '/matches', $a['token'])['body']['matches'];
$assert(count($matches) === 1 && $matches[0]['seed'] === $results['seed'] && $matches[0]['round'] === 1, '/matches có seed và round.');
$assert($stepPhase($pdo, $a, $code)['body']['room']['phase'] === 'scoring', 'revealing → scoring.');
$assert($poll($pdo, $a, $code)['body']['balance'] === 10000, 'Scoring vẫn che số dư sau thanh toán.');
$assert($stepPhase($pdo, $a, $code)['body']['room']['phase'] === 'summary', 'scoring → summary.');
$summary = $poll($pdo, $a, $code)['body'];
$assert($summary['results'] !== null, 'Summary có kết quả.');
$assert($summary['balance'] === zp_balance($pdo, $a['id']), 'Từ summary trả số dư sau thanh toán.');
foreach ($summary['room']['players'] as $listed) {
    $user = array_values(array_filter($users, static fn(array $candidate): bool => $candidate['name'] === $listed['name']))[0];
    $assert($listed['balance'] === zp_balance($pdo, $user['id']), 'players[].balance sau thanh toán từ summary.');
}
$assert($stepPhase($pdo, $a, $code)['body']['room']['phase'] === 'next', 'summary → next.');
$nextRoom = zp_room_row($pdo, $code);
zp_advance_time((int)$nextRoom['phase_deadline'] - zingplay_now() - 1);
$keepAlive($pdo, $users, $code);
$assert($phaseOf($pdo, $a, $code) === 'next', 'Chưa đủ 3s sau next thì chưa chia ván mới.');
zp_advance_time(1);
$round2 = $poll($pdo, $a, $code)['body'];
$assert($round2['room']['phase'] === 'dealing' && $round2['room']['round'] === 2 && $round2['results'] === null
    && $round2['submitted'] === false && $round2['arrangement'] === null, 'Ván mới tự bắt đầu đúng 3s sau next.');
$assert(zp_total_balance($pdo) === $startTotal, 'Tổng xu hệ thống không đổi.');
$ledger = (int)$pdo->query("SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE type = 'match_result'")->fetchColumn();
$assert($ledger === 0, 'wallet_transactions của ván cộng bằng 0.');

// ---------------------------------------------------------------- 4. Hết giờ tự xếp, kết nối lại, changed:false
$keepAlive($pdo, $users, $code);
$assert($stepPhase($pdo, $a, $code)['body']['room']['phase'] === 'arranging', 'Ván 2: dealing → arranging.');
$keepAlive($pdo, $users, $code);
$versionAt = $poll($pdo, $a, $code)['body']['version'];
$light = $poll($pdo, $a, $code, ['since_version' => $versionAt]);
$assert($light['status'] === 200 && $light['body'] === ['changed' => false, 'version' => $versionAt, 'serverTime' => zingplay_now() * 1000],
    'since_version trùng → {changed:false} nhẹ.');
$stale = $poll($pdo, $a, $code, ['since_version' => $versionAt - 1]);
$assert(isset($stale['body']['cards'], $stale['body']['room']) && count($stale['body']['cards']) === 13, 'Poll với version cũ vẫn nhận đủ bài (reconnect).');
$assert($poll($pdo, $a, $code, ['since_version' => 'abc'])['status'] === 400, 'since_version không hợp lệ → 400.');
zp_submit_auto($pdo, $a, $code);
$beforeTimeout = zp_balance($pdo, $b['id']);
zp_advance_time((int)zp_room_row($pdo, $code)['phase_deadline'] - zingplay_now());
$timed = $poll($pdo, $a, $code)['body'];
$assert($timed['room']['phase'] === 'revealing' && $timed['results'] !== null, 'Hết giờ → tự xếp và tính điểm.');
foreach ($timed['results']['players'] as $result) {
    $arranged = zingplayValidateArrangement(zingplayHandsCards($result['hands']), array_map(
        static fn(array $hand): array => array_column($hand, 'id'),
        $result['hands'],
    ));
    $assert($arranged['valid'], 'Bài tự xếp không binh lủng.');
}
$assert(array_sum(array_column($timed['results']['players'], 'chips')) === 0, 'Ván hết giờ vẫn zero-sum.');
$assert(zp_total_balance($pdo) === $startTotal, 'Tổng xu không đổi sau ván hết giờ.');
$assert($phaseOf($pdo, $b, $code) === 'revealing', 'Người khác thấy cùng phase.');

// ---------------------------------------------------------------- 5. Rời giữa ván, khán giả, hết xu
$pdo = $fresh();
$users = zp_users($pdo, 5);
[$a, $b, $c, $d, $e] = $users;
$startTotal = zp_total_balance($pdo);
$code = $createAuto($pdo, $a)['room']['code'];
foreach ([$b, $c] as $user) {
    $join($pdo, $user, $code);
}
$assert(zp_api($pdo, 'POST', '/rooms/' . $code . '/start', $b['token'])['status'] === 403, 'Chỉ chủ phòng bấm start.');
$started = zp_api($pdo, 'POST', '/rooms/' . $code . '/start', $a['token']);
$assert($started['status'] === 200 && $started['body']['room']['phase'] === 'dealing' && count($started['body']['cards']) === 13,
    'Chủ phòng start thủ công với 3 người.');
$stepPhase($pdo, $a, $code);
// Khán giả vào giữa ván.
$spectatorJoin = $join($pdo, $d, $code);
$assert($spectatorJoin['status'] === 200 && $spectatorJoin['body']['cards'] === []
    && array_values(array_filter($spectatorJoin['body']['room']['players'], static fn(array $p): bool => $p['spectator']))[0]['name'] === $d['name'],
    'Khán giả vào giữa ván: không có bài, spectator=true.');
$assert(zp_submit_auto($pdo, $d, $code)['status'] === 409, 'Khán giả không nộp bài được.');
$listed = zp_api($pdo, 'GET', '/rooms', $e['token'])['body']['rooms'];
$listedFull = array_values(array_filter($listed, static fn(array $room): bool => $room['code'] === $code));
$assert(count($listedFull) === 1 && $listedFull[0]['playerCount'] === 4,
    'Bàn đủ người vẫn được liệt kê để hiện trạng thái Đầy.');
// Người rời giữa ván trở thành "ma": ván vẫn tiếp tục, vẫn thanh toán.
$leave = zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $c['token']);
$assert($leave['status'] === 200 && $leave['body']['cancelled'] === false, 'Rời giữa ván không hủy ván khi còn đủ người.');
$assert($poll($pdo, $c, $code)['status'] === 403, 'Người rời nhận 403 khi poll.');
$assert(zp_api($pdo, 'POST', '/rooms', $c['token'], ['autoPlay' => true])['status'] === 201, 'Người rời tạo/vào phòng khác được ngay.');
$assert($join($pdo, $c, $code)['status'] === 409, 'Người vừa rời không vào lại ván đang chạy.');
zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $c['token']);
$ghosts = $poll($pdo, $a, $code)['body']['room']['players'];
$assert(count(array_filter($ghosts, static fn(array $p): bool => $p['left'])) === 1, 'Người ma vẫn nằm trong danh sách (left=true).');
zp_submit_auto($pdo, $a, $code);
$final = zp_submit_auto($pdo, $b, $code);
$assert($final['body']['room']['phase'] === 'revealing', 'Ghost không chặn việc kết thúc khi mọi người thật đã nộp.');
$resultPlayers = $final['body']['results']['players'];
$assert(count($resultPlayers) === 3 && in_array($c['name'], array_column($resultPlayers, 'name'), true), 'Người ma vẫn có mặt trong kết quả (không có khán giả).');
$assert(!in_array($d['name'], array_column($resultPlayers, 'name'), true), 'Khán giả không tính điểm.');
$assert(array_sum(array_column($resultPlayers, 'chips')) === 0, 'Có người ma vẫn zero-sum.');
$assert(zp_total_balance($pdo) === $startTotal, 'Tổng xu không đổi.');
$assert(count($final['body']['room']['players']) === 3, 'Người ma bị xóa khỏi phòng sau khi thanh toán.');
// Hết xu: hạ số dư của b dưới mức tối thiểu → bị đưa ra ở ván kế.
zp_set_balance($pdo, $b['id'], 999);
$startTotal = zp_total_balance($pdo);
foreach (['scoring', 'summary', 'next'] as $_) {
    $stepPhase($pdo, $a, $code);
    $keepAlive($pdo, [$a, $b, $d], $code);
}
zp_advance_time(3);
$keepAlive($pdo, [$a, $d], $code);
$afterKick = $poll($pdo, $a, $code)['body'];
$assert($afterKick['room']['phase'] === 'dealing' && $afterKick['room']['round'] === 2, 'Ván 2 bắt đầu.');
$assert($poll($pdo, $b, $code)['status'] === 403, 'Người hết xu bị đưa ra khỏi phòng.');
$assert(count($afterKick['room']['players']) === 2 && count($afterKick['cards']) === 13, 'Còn 2 người, khán giả được chia bài.');
$assert(count($poll($pdo, $d, $code)['body']['cards']) === 13 && $poll($pdo, $d, $code)['body']['room']['players'][1]['spectator'] === false,
    'Khán giả thành người chơi ở ván sau.');
$assert(zp_total_balance($pdo) === $startTotal, 'Tổng xu không đổi khi kick.');

// Rời đến khi còn dưới 2 người thật → hủy ván, không đổi xu.
$cancelBalances = [zp_balance($pdo, $a['id']), zp_balance($pdo, $d['id'])];
$cancel = zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $d['token']);
$assert($cancel['status'] === 200 && $cancel['body']['cancelled'] === false, 'Leave (auto) trả cancelled=false.');
$afterCancel = $poll($pdo, $a, $code)['body'];
$assert($afterCancel['room']['phase'] === 'waiting' && $afterCancel['cards'] === [] && $afterCancel['results'] === null
    && isset($afterCancel['room']['cancelMessage']) && count($afterCancel['room']['players']) === 1, 'Còn <2 người thật → hủy ván về waiting.');
$assert([zp_balance($pdo, $a['id']), zp_balance($pdo, $d['id'])] === $cancelBalances, 'Hủy ván không đổi xu.');
zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $a['token']);
$emptyRoom = zp_room_row($pdo, $code);
$assert($emptyRoom !== null && (int)$emptyRoom['empty_since'] === zingplay_now(), 'Bàn trống được đánh dấu để chờ hết thời gian ân hạn.');
zp_advance_time(31);
zp_api($pdo, 'GET', '/rooms', $b['token']);
$assert(zp_room_row($pdo, $code) === null, 'Bàn trống quá 30 giây được xóa.');

// ---------------------------------------------------------------- 6. Rời khi chủ phòng, chuyển chủ
$pdo = $fresh();
[$a, $b, $c] = zp_users($pdo, 3);
$code = $createAuto($pdo, $a)['room']['code'];
$join($pdo, $b, $code);
$join($pdo, $c, $code);
zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $a['token']);
$snapshot = $poll($pdo, $b, $code)['body'];
$assert($snapshot['room']['hostId'] === $snapshot['playerId'], 'Chủ rời → chuyển chủ cho người kế tiếp.');

// ---------------------------------------------------------------- 7. Người không hoạt động bị đưa ra khi bắt đầu ván
$pdo = $fresh();
[$a, $b, $c] = zp_users($pdo, 3);
$code = $createAuto($pdo, $a)['room']['code'];
$join($pdo, $b, $code);
$join($pdo, $c, $code);
zp_advance_time(60);
$poll($pdo, $a, $code);
$seenStatement = $pdo->prepare('SELECT last_seen FROM game_room_players WHERE room_code = ? AND user_id = ?');
$seenStatement->execute([$code, $a['id']]);
$seen = (int)$seenStatement->fetchColumn();
$assert($seen === zingplay_now(), 'Mọi request polling đều cập nhật last_seen.');
$poll($pdo, $b, $code);
$start = zp_api($pdo, 'POST', '/rooms/' . $code . '/start', $a['token']);
$assert($start['status'] === 200 && count($start['body']['room']['players']) === 2, 'Idle > 45s bị loại khi chia bài.');
$assert($poll($pdo, $c, $code)['status'] === 403, 'Người idle nhận 403.');

// ---------------------------------------------------------------- 8. Quick-play và danh sách phòng
$pdo = $fresh();
$users = zp_users($pdo, 6);
$first = zp_api($pdo, 'POST', '/rooms/quick', $users[0]['token']);
$assert($first['status'] === 201 && $first['body']['room']['autoPlay'] === true && $first['body']['room']['maxPlayers'] === 4
    && $first['body']['room']['stake'] === 50, 'Quick-play không có phòng → tạo phòng công khai auto_play.');
$other = $createAuto($pdo, $users[1], ['stake' => 100]);
$second = zp_api($pdo, 'POST', '/rooms/quick', $users[2]['token'], ['stake' => 100]);
$assert($second['status'] === 200 && $second['body']['room']['code'] === $other['room']['code'], 'Quick-play theo mức cược.');
$third = zp_api($pdo, 'POST', '/rooms/quick', $users[3]['token']);
$assert($third['status'] === 200 && $third['body']['room']['code'] === $first['body']['room']['code'], 'Mặc định mức thấp nhất đủ xu.');
zp_set_balance($pdo, $users[4]['id'], 5000);
$rich = zp_api($pdo, 'POST', '/rooms/quick', $users[4]['token'], ['stake' => 200]);
$assert($rich['status'] === 201 && $rich['body']['room']['stake'] === 200, 'Quick-play với mức cược chỉ định, chưa có phòng → tạo mới.');
$ledgerBefore = (int)$pdo->query("SELECT COUNT(*) FROM wallet_transactions WHERE type = 'auto_topup'")->fetchColumn();
zp_set_balance($pdo, $users[5]['id'], 10);
$me = zp_api($pdo, 'GET', '/auth/me', $users[5]['token']);
$assert($me['body']['user']['balance'] === 10000 && $me['body']['user']['autoTopupAmount'] === 10000,
    'Lấy tài khoản tự tặng xu khi số dư dưới ngưỡng.');
$again = zp_api($pdo, 'GET', '/auth/me', $users[5]['token']);
$assert(!isset($again['body']['user']['autoTopupAmount']), 'Không tặng xu lần hai khi số dư đã đạt ngưỡng.');
$assert((int)$pdo->query("SELECT COUNT(*) FROM wallet_transactions WHERE type = 'auto_topup'")->fetchColumn() === $ledgerBefore + 1,
    'Tự tặng xu được ghi đúng một lần vào sổ cái.');
$assert(zp_api($pdo, 'POST', '/rooms/quick', $users[0]['token'])['status'] === 409, 'Đang ở phòng thì không quick-play.');
$assert(zp_api($pdo, 'POST', '/rooms/quick', $users[5]['token'], ['stake' => 7])['status'] === 400, 'Mức cược sai → 400.');
$list = zp_api($pdo, 'GET', '/rooms', $users[5]['token'])['body']['rooms'];
$assert(count($list) === 3, 'Danh sách có 3 phòng công khai còn chỗ.');
$sample = array_values(array_filter($list, static fn(array $room): bool => $room['code'] === $first['body']['room']['code']))[0];
$assert($sample === ['code' => $first['body']['room']['code'], 'hostName' => $users[0]['name'], 'playerCount' => 2, 'stake' => 50,
    'maxPlayers' => 4, 'hasPassword' => false, 'phase' => 'waiting', 'autoPlay' => true, 'round' => 0], 'Phần tử danh sách phòng.');

// ---------------------------------------------------------------- 8b. Cấu hình điểm Tiến Lên và quick-play không ghép bàn tính xu
$pointsPdo = $fresh();
[$a, $b, $c] = zp_users($pointsPdo, 3);
$coinRoom = $createAuto($pointsPdo, $a, ['game_type' => 'tienlen', 'scoringMode' => 'coins', 'maxPlayers' => 2]);
$pointsRoom = zp_api($pointsPdo, 'POST', '/rooms', $b['token'], [
    'game_type' => 'tienlen', 'autoPlay' => true, 'isPublic' => true, 'stake' => 50, 'maxPlayers' => 2,
    'scoringConfig' => ['whiteTypes' => ['dragon' => true, 'four_twos' => false]],
]);
$assert($pointsRoom['status'] === 201 && $pointsRoom['body']['room']['scoringMode'] === 'points'
    && $pointsRoom['body']['room']['scoringConfig']['whiteTypes'] === [
        'dragon' => true, 'four_twos' => false, 'six_pairs' => false, 'five_pairs_run' => false, 'four_threes' => false,
    ], 'Bàn Tiến Lên mặc định tính điểm và nhận map bật/tắt tới trắng.');
$badWhiteTypes = zp_api($pointsPdo, 'POST', '/rooms', $c['token'], [
    'game_type' => 'tienlen', 'autoPlay' => true, 'isPublic' => true, 'stake' => 50,
    'scoringConfig' => ['whiteTypes' => ['dragon' => 'true']],
]);
$assert($badWhiteTypes['status'] === 400, 'Map tới trắng sai kiểu bị từ chối.');
$quickTienLen = zp_api($pointsPdo, 'POST', '/rooms/quick', $c['token'], ['game_type' => 'tienlen', 'stake' => 50]);
$assert($quickTienLen['status'] === 200 && $quickTienLen['body']['room']['code'] === $pointsRoom['body']['room']['code']
    && $quickTienLen['body']['room']['code'] !== $coinRoom['room']['code']
    && $quickTienLen['body']['room']['scoringMode'] === 'points', 'Quick-play Tiến Lên ghép bàn tính điểm, không ghép bàn tính xu.');

$manualPdo = $fresh();
[$a, $b] = zp_users($manualPdo, 2);
$code = $createAuto($manualPdo, $a, ['game_type' => 'tienlen', 'maxPlayers' => 2, 'scoringConfig' => ['whiteEnabled' => false]])['room']['code'];
$join($manualPdo, $b, $code);
$playerIds = array_column(zingplay_lock_players($manualPdo, $code), 'player_id');
$previousState = ['matchEnded' => true, 'matchTotals' => array_fill_keys($playerIds, 9), 'winner' => $playerIds[0]];
$manualPdo->prepare("UPDATE game_rooms SET status = 'playing', phase = 'summary', round_no = 1, game_state = ?, phase_deadline = ? WHERE code = ?")
    ->execute([zingplay_json($previousState), zingplay_now() + 15, $code]);
$manualStart = zp_api($manualPdo, 'POST', '/rooms/' . $code . '/start', $a['token']);
$assert($manualStart['status'] === 200 && $manualStart['body']['room']['phase'] === 'dealing'
    && $manualStart['body']['room']['round'] === 2
    && $manualStart['body']['matchTotals'] === array_fill_keys($playerIds, 0), 'Chủ bàn bắt đầu trận mới thủ công và tổng điểm được reset.');

$automaticPdo = $fresh();
[$a, $b] = zp_users($automaticPdo, 2);
$code = $createAuto($automaticPdo, $a, ['game_type' => 'tienlen', 'maxPlayers' => 2, 'scoringConfig' => ['whiteEnabled' => false]])['room']['code'];
$join($automaticPdo, $b, $code);
$playerIds = array_column(zingplay_lock_players($automaticPdo, $code), 'player_id');
$automaticPdo->prepare("UPDATE game_rooms SET status = 'playing', phase = 'summary', round_no = 1, game_state = ?, phase_deadline = ? WHERE code = ?")
    ->execute([zingplay_json(['matchEnded' => true, 'matchTotals' => array_fill_keys($playerIds, 9)]), zingplay_now() + 15, $code]);
zp_advance_time(15);
$automaticStart = $poll($automaticPdo, $a, $code);
$assert($automaticStart['body']['room']['phase'] === 'dealing' && $automaticStart['body']['room']['round'] === 2
    && $automaticStart['body']['matchTotals'] === array_fill_keys($playerIds, 0), 'Hết thời gian tổng kết tự bắt đầu trận mới và reset tổng điểm.');

// Phòng auto_play đang chơi vẫn hiện nếu còn chỗ; phòng riêng tư thì không.
$private = $createAuto($pdo, zp_register($pdo, '0911111111'), ['isPublic' => false]);
$assert(count(zp_api($pdo, 'GET', '/rooms', $users[5]['token'])['body']['rooms']) === 3, 'Phòng riêng tư không hiện.');
$code = $first['body']['room']['code'];
zp_api($pdo, 'POST', '/rooms/' . $code . '/start', $users[0]['token']);
$playing = array_values(array_filter(zp_api($pdo, 'GET', '/rooms', $users[5]['token'])['body']['rooms'], static fn(array $room): bool => $room['code'] === $code));
$assert(count($playing) === 1 && $playing[0]['phase'] === 'dealing' && $playing[0]['round'] === 1, 'Phòng auto_play đang chơi còn chỗ vẫn hiện.');

// ---------------------------------------------------------------- 9. Dọn phòng trống sau thời gian ân hạn
$pdo = $fresh();
[$a, $b] = zp_users($pdo, 2);
$code = $createAuto($pdo, $a)['room']['code'];
zp_advance_time(46);
zp_api($pdo, 'GET', '/rooms', $b['token']);
$emptyRoom = zp_room_row($pdo, $code);
$assert($emptyRoom !== null && (int)$emptyRoom['empty_since'] === zingplay_now(), 'Người không heartbeat quá 45 giây được xem là đã rời bàn.');
zp_advance_time(31);
zp_api($pdo, 'GET', '/rooms', $b['token']);
$assert(zp_room_row($pdo, $code) === null, 'Bàn không người quá 30 giây bị xóa.');

$pdo = $fresh();
$insertRoom = $pdo->prepare(
    "INSERT INTO game_rooms (code, host_player_id, status, empty_since) VALUES (?, ?, 'waiting', ?)",
);
for ($index = 0; $index < 51; $index++) {
    $insertRoom->execute([sprintf('X%04d', $index), new_id(), zingplay_now() - 31]);
}
cleanup_rooms($pdo);
$remaining = (int)$pdo->query('SELECT COUNT(*) FROM game_rooms')->fetchColumn();
$assert($remaining === 1, 'Mỗi lần dọn lười chỉ xử lý tối đa 50 bàn.');
zp_advance_time(10);
cleanup_rooms($pdo);
$assert((int)$pdo->query('SELECT COUNT(*) FROM game_rooms')->fetchColumn() === 0, 'Khóa meta cho phép dọn tiếp sau 10 giây.');

// ---------------------------------------------------------------- 10. Tới trắng trong ván thật
$searchSeed = static function (): array {
    for ($i = 0; $i < 200000; $i++) {
        $seed = hash('md5', 'white-' . $i);
        $deck = zingplayShuffleWithSeed($seed);
        $white = zingplayDetectWhite(array_slice($deck, 0, 13));
        if ($white !== null && zingplayDetectWhite(array_slice($deck, 13, 13)) === null) {
            return [$seed, $white];
        }
    }
    throw new RuntimeException('Không tìm được seed có tới trắng.');
};
[$whiteSeed, $whiteKey] = $searchSeed();
$pdo = $fresh();
[$a, $b] = zp_users($pdo, 2);
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = [$whiteSeed];
$code = $createAuto($pdo, $a, ['maxPlayers' => 2])['room']['code'];
$join($pdo, $b, $code);
zp_advance_time(3);
$poll($pdo, $a, $code);
$stepPhase($pdo, $a, $code);
$result = zp_submit_auto($pdo, $a, $code);
$result = zp_submit_auto($pdo, $b, $code);
$whitePlayer = $result['body']['results']['players'][0];
$assert($result['body']['results']['seed'] === $whiteSeed && $whitePlayer['white'] === $whiteKey
    && $whitePlayer['points'] === ZINGPLAY_WHITE_TYPES[$whiteKey]['points'] && $whitePlayer['chips'] === ZINGPLAY_WHITE_TYPES[$whiteKey]['points'] * 50
    && $result['body']['results']['players'][1]['chips'] === -$whitePlayer['chips'], 'Tới trắng trong ván thật: thắng điểm cố định, xu zero-sum.');
$assert($whitePlayer['pairs'][0]['white'] === true && $whitePlayer['chi']['back']['label'] === 'Tới trắng', 'Chi tiết cặp tới trắng.');

// ---------------------------------------------------------------- 11. Chế độ cũ (autoPlay=false) giữ nguyên hành vi
$pdo = $fresh();
[$a, $b] = zp_users($pdo, 2);
$old = zp_api($pdo, 'POST', '/rooms', $a['token'], ['isPublic' => true]);
$code = $old['body']['room']['code'];
$assert($old['status'] === 201 && $old['body']['room']['autoPlay'] === false && $old['body']['room']['phase'] === 'waiting', 'Phòng cũ.');
$join($pdo, $b, $code);
$assert(zp_api($pdo, 'POST', '/rooms/' . $code . '/start', $a['token'])['body']['room']['started'] === true, 'Phòng cũ start thủ công.');
zp_advance_time(30);
$assert($poll($pdo, $a, $code)['body']['room']['phase'] === 'arranging', 'Phòng cũ không tự chuyển phase.');
zp_submit_auto($pdo, $a, $code);
$oldFinal = zp_submit_auto($pdo, $b, $code);
$assert($oldFinal['body']['room']['finished'] === true && $oldFinal['body']['historySaved'] === true
    && $oldFinal['body']['results']['round'] === 1 && count($oldFinal['body']['results']['players']) === 2, 'Phòng cũ kết thúc khi mọi người nộp.');
$assert(array_sum(array_column($oldFinal['body']['results']['players'], 'chips')) === 0, 'Phòng cũ zero-sum.');
$legacyLeave = zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $a['token']);
$assert($legacyLeave['body'] === ['status' => 'ok', 'cancelled' => false], 'Leave phòng cũ sau khi xong.');

// Phòng cũ: rời giữa ván hủy ván.
$pdo = $fresh();
[$a, $b] = zp_users($pdo, 2);
$code = zp_api($pdo, 'POST', '/rooms', $a['token'], [])['body']['room']['code'];
$join($pdo, $b, $code);
zp_api($pdo, 'POST', '/rooms/' . $code . '/start', $a['token']);
$assert(zp_api($pdo, 'POST', '/rooms/' . $code . '/leave', $b['token'])['body']['cancelled'] === true, 'Phòng cũ: rời giữa ván hủy ván.');
$cancelled = $poll($pdo, $a, $code)['body'];
$assert($cancelled['room']['cancelled'] === true && isset($cancelled['room']['cancelMessage']), 'Snapshot phòng cũ bị hủy.');

// ---------------------------------------------------------------- 12. Chat polling, kiểm soát quyền và giới hạn tin
$pdo = $fresh();
[$a, $b, $c] = zp_users($pdo, 3);
$code = $createAuto($pdo, $a)['room']['code'];
$join($pdo, $b, $code);
$sendChat = static fn(array $user, array $body): array
    => zp_api($pdo, 'POST', '/rooms/' . $code . '/chat', $user['token'], $body);
$firstChat = $sendChat($a, ['text' => '<b>Xin chào</b><script>alert(1)</script>']);
$assert($firstChat['status'] === 201 && !str_contains($firstChat['body']['message']['text'], '<')
    && $firstChat['body']['message']['text'] === 'Xin chàoalert(1)', 'Tin chat được lọc HTML trước khi lưu.');
$assert($sendChat($a, ['text' => 'Gửi quá nhanh'])['status'] === 429, 'Giới hạn một tin mỗi giây/người.');
$assert($sendChat($c, ['text' => 'Người ngoài'])['status'] === 403, 'Người ngoài bàn không gửi được chat.');
$pollWithChat = $poll($pdo, $b, $code, ['chat_since_id' => 0])['body'];
$assert(count($pollWithChat['chatMessages']) === 1
    && $pollWithChat['chatMessages'][0]['id'] === $firstChat['body']['message']['id'], 'Chat được nhận qua polling trạng thái bàn.');
zp_advance_time(1);
$secondChat = $sendChat($b, ['text' => str_repeat('á', 201)]);
$assert($secondChat['status'] === 201 && count(preg_split('//u', $secondChat['body']['message']['text'], -1, PREG_SPLIT_NO_EMPTY)) === 200,
    'Nội dung chat được giới hạn tối đa 200 ký tự Unicode.');
$incremental = $poll($pdo, $a, $code, ['chat_since_id' => $firstChat['body']['message']['id']])['body'];
$assert(count($incremental['chatMessages']) === 1 && $incremental['chatMessages'][0]['id'] === $secondChat['body']['message']['id'],
    'chat_since_id chỉ trả tin mới.');
for ($index = 0; $index < 51; $index++) {
    zp_advance_time(1);
    $poll($pdo, $a, $code);
    $chatResponse = $sendChat($a, ['text' => 'Tin ' . $index]);
    $assert($chatResponse['status'] === 201, 'Gửi được tin trong kiểm tra giới hạn lưu: ' . json_encode($chatResponse, JSON_UNESCAPED_UNICODE));
}
$latestChats = $poll($pdo, $a, $code, ['chat_since_id' => 0])['body']['chatMessages'];
$assert(count($latestChats) === 50 && $latestChats[0]['text'] === 'Tin 1', 'Mỗi bàn chỉ lưu 50 tin mới nhất.');
$assert($poll($pdo, $c, $code)['status'] === 403, 'Người ngoài bàn không đọc được snapshot/chat.');
$removeChatRoom = $pdo->prepare('DELETE FROM game_rooms WHERE code = ?');
$removeChatRoom->execute([$code]);
$assert((int)$pdo->query('SELECT COUNT(*) FROM table_chat WHERE table_id = ' . $pdo->quote($code))->fetchColumn() === 0,
    'Xóa bàn đồng thời xóa chat theo khóa ngoại.');

echo "Realtime feature tests passed ($passed assertions, " . zp_driver() . ").\n";

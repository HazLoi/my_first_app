<?php
declare(strict_types=1);

// Mô phỏng 4 client chơi liên tục 50 ván qua API (gọi trực tiếp handler, thời gian giả lập mỗi 1 giây).
// Chạy: php tests/realtime_sim.php   (đặt ZP_MYSQL_DSN/ZP_MYSQL_USER/ZP_MYSQL_PASS để chạy trên MariaDB)

require_once __DIR__ . '/harness.php';

const SIM_ROUNDS = 50;
const SIM_STAKE = 50;

$T0 = time();
$GLOBALS['ZINGPLAY_CONFIG'] = [];
zp_set_time($T0);
$pdo = zp_fresh_database();
$users = zp_users($pdo, 4);
$credit = static function (PDO $pdo, array $user, int $amount): void {
    $balance = zp_balance($pdo, $user['id']) + $amount;
    zp_set_balance($pdo, $user['id'], $balance);
    record_wallet_transaction($pdo, $user['id'], 'admin_credit', $amount, $balance, null, null, 'Nạp cho mô phỏng');
};
foreach ($users as $user) {
    $credit($pdo, $user, 90000);
}
$systemTotal = zp_total_balance($pdo);

// Seed cố định cho cả 50 ván; mỗi 10 ván có một ván tới trắng.
$whiteSeeds = [];
for ($i = 0; count($whiteSeeds) < 5 && $i < 400000; $i++) {
    $seed = hash('md5', 'sim-white-' . $i);
    $white = zingplayDetectWhite(array_slice(zingplayShuffleWithSeed($seed), 0, 13));
    if ($white !== null && !isset($whiteSeeds[$white])) {
        $whiteSeeds[$white] = $seed;
    }
}
$seeds = [];
for ($round = 1; $round <= SIM_ROUNDS + 5; $round++) {
    $seeds[] = $round % 10 === 0 ? array_values($whiteSeeds)[intdiv($round, 10) % count($whiteSeeds)] : hash('md5', 'sim-' . $round);
}
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = $seeds;

$requests = 0;
$api = static function (string $method, string $route, ?string $token = null, ?array $body = null, array $query = []) use ($pdo, &$requests): array {
    $requests++;
    return zp_api($pdo, $method, $route, $token, $body, $query);
};

$create = $api('POST', '/rooms', $users[0]['token'], ['autoPlay' => true, 'stake' => SIM_STAKE, 'isPublic' => true]);
$code = $create['body']['room']['code'];
foreach (array_slice($users, 1) as $user) {
    check($api('POST', '/rooms/join', $user['token'], ['code' => $code])['status'] === 200, 'Vào phòng thất bại.');
}

$clients = [];
foreach ($users as $index => $user) {
    $clients[$index] = ['user' => $user, 'version' => null, 'submitAt' => null, 'round' => 0, 'offlineUntil' => 0,
        'inRoom' => true, 'rejoinAt' => null];
}
$stats = ['rounds' => 0, 'whites' => 0, 'timeouts' => 0, 'ghosts' => 0, 'reconnects' => 0, 'kicks' => 0, 'rejoins' => 0,
    'chiTotal' => 0, 'maxAbsChips' => 0];
$finished = [];
$phaseAt = [];
$lastSeenVersion = 0;
$guard = 0;

$allHandIds = static function (PDO $pdo, string $code): array {
    $statement = $pdo->prepare('SELECT user_id, hand_json FROM game_room_players WHERE room_code = ?');
    $statement->execute([$code]);
    $map = [];
    foreach ($statement->fetchAll() as $row) {
        $map[$row['user_id']] = array_column(json_decode((string)$row['hand_json'], true) ?: [], 'id');
    }
    return $map;
};

while (count($finished) < SIM_ROUNDS) {
    check(++$guard < 6000, 'Mô phỏng chạy quá lâu (có thể kẹt phase).');
    zp_advance_time(1);
    $now = zingplay_now();
    foreach ($clients as $index => &$client) {
        $user = $client['user'];
        if ($client['offlineUntil'] > $now) {
            continue;
        }
        if (!$client['inRoom']) {
            if ($client['rejoinAt'] !== null && $now >= $client['rejoinAt']) {
                $response = $api('POST', '/rooms/join', $user['token'], ['code' => $code]);
                if ($response['status'] === 200) {
                    $client['inRoom'] = true;
                    $client['rejoinAt'] = null;
                    $client['version'] = null;
                    $stats['rejoins']++;
                }
            }
            continue;
        }
        $query = $client['version'] === null ? [] : ['since_version' => $client['version']];
        $response = $api('GET', '/rooms/' . $code, $user['token'], null, $query);
        if ($response['status'] === 403) {
            // Bị đưa ra (hết xu/không hoạt động): nạp xu rồi vào lại.
            $stats['kicks']++;
            $client['inRoom'] = false;
            $client['rejoinAt'] = $now + 1;
            if (zp_balance($pdo, $user['id']) < zingplayMinBalance(SIM_STAKE)) {
                $credit($pdo, $user, 90000);
                $systemTotal += 90000;
            }
            continue;
        }
        check($response['status'] === 200, 'Poll lỗi: ' . json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        $body = $response['body'];
        check(isset($body['serverTime']) && $body['serverTime'] === $now * 1000, 'serverTime phải bám đồng hồ giả lập.');
        if (($body['changed'] ?? null) === false) {
            check($body['version'] === $client['version'], 'changed:false chỉ khi version không đổi.');
            continue;
        }
        check($client['version'] === null || $body['version'] > $client['version'], 'Version phải tăng dần.');
        $client['version'] = $body['version'];
        $room = $body['room'];

        // Quyền riêng tư: trước revealing, snapshot không chứa bài của người khác.
        if (in_array($room['phase'], ['dealing', 'arranging'], true)) {
            $encoded = json_encode($body, JSON_UNESCAPED_UNICODE);
            foreach ($allHandIds($pdo, $code) as $ownerId => $ids) {
                if ($ownerId === $user['id']) {
                    continue;
                }
                foreach ($ids as $id) {
                    check(!str_contains($encoded, '"' . $id . '"'), 'Lộ bài người khác trong phase ' . $room['phase']);
                }
            }
            check($body['results'] === null, 'Không có kết quả trước revealing.');
        }

        $phaseKey = $room['round'] . ':' . $room['phase'];
        $phaseAt[$phaseKey] = $room['phaseStartedAt'];

        if ($room['phase'] === 'arranging' && !$body['submitted'] && count($body['cards']) === 13) {
            if ($client['round'] !== $room['round']) {
                $client['round'] = $room['round'];
                mt_srand($room['round'] * 31 + $index);
                $client['submitAt'] = $now + mt_rand(1, 12);
                // Một người treo máy (không nộp) mỗi 7 ván; một người mất mạng 20 giây mỗi 9 ván.
                if ($room['round'] % 7 === 0 && $index === 1) {
                    $client['submitAt'] = null;
                    $stats['timeouts']++;
                }
                if ($room['round'] % 9 === 0 && $index === 2) {
                    $client['offlineUntil'] = $now + 20;
                    $client['reconnectCheck'] = true;
                    $stats['reconnects']++;
                    continue;
                }
                // Người 3 rời giữa ván mỗi 13 ván, rồi vào lại sau khi ván kết thúc.
                if ($room['round'] % 13 === 0 && $index === 3) {
                    $leave = $api('POST', '/rooms/' . $code . '/leave', $user['token']);
                    check($leave['status'] === 200 && $leave['body']['cancelled'] === false, 'Rời giữa ván phải không hủy ván.');
                    $client['inRoom'] = false;
                    $client['rejoinAt'] = $now + 25;
                    $stats['ghosts']++;
                    continue;
                }
            }
            if ($client['submitAt'] !== null && $now >= $client['submitAt']) {
                $submit = $api('POST', '/rooms/' . $code . '/submit', $user['token'], [
                    'arrangement' => zingplayAutoArrange($body['cards']),
                ]);
                check($submit['status'] === 200, 'Nộp bài lỗi: ' . json_encode($submit['body'], JSON_UNESCAPED_UNICODE));
                $client['version'] = $submit['body']['version'];
            }
        }
        if (!empty($client['reconnectCheck']) && count($body['cards']) === 13) {
            $client['reconnectCheck'] = false;
        }

        if ($body['results'] !== null && !isset($finished[$body['results']['round']])) {
            $results = $body['results'];
            $round = $results['round'];
            $finished[$round] = true;
            $players = $results['players'];
            check(array_sum(array_column($players, 'points')) === 0, "Ván $round: tổng điểm khác 0.");
            check(array_sum(array_column($players, 'chips')) === 0, "Ván $round: tổng xu khác 0.");
            check($results['seed'] === $seeds[$round - 1], "Ván $round: seed không khớp hàng đợi.");
            foreach ($players as $result) {
                check($result['balanceAfter'] >= 0 && $result['balanceBefore'] + $result['chips'] === $result['balanceAfter'], 'Số dư sai.');
                $stats['maxAbsChips'] = max($stats['maxAbsChips'], abs($result['chips']));
                if ($result['white'] !== null) {
                    $stats['whites']++;
                }
                check(count($result['pairs']) === count($players) - 1, 'Thiếu chi tiết cặp.');
            }
            $stats['rounds']++;
            check(zp_total_balance($pdo) === $systemTotal, "Ván $round: tổng xu hệ thống thay đổi.");
            check((int)$pdo->query('SELECT COUNT(*) FROM users WHERE balance < 0')->fetchColumn() === 0, 'Có số dư âm.');
        }
    }
    unset($client);
}

foreach ($clients as $client) {
    check(empty($client['reconnectCheck']), 'Client kết nối lại phải nhận đủ 13 lá bài.');
}
// Sổ cái: số dư mỗi người bằng tổng mọi giao dịch của họ.
foreach ($users as $user) {
    $statement = $pdo->prepare('SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE user_id = ?');
    $statement->execute([$user['id']]);
    check((int)$statement->fetchColumn() === zp_balance($pdo, $user['id']), 'Sổ cái không khớp số dư của ' . $user['name']);
}
// Mỗi ván đã lưu đúng một bản ghi lịch sử với seed/round.
$matchCount = (int)$pdo->query('SELECT COUNT(*) FROM matches')->fetchColumn();
check($matchCount >= SIM_ROUNDS, 'Thiếu lịch sử ván: ' . $matchCount);
check((int)$pdo->query('SELECT COUNT(*) FROM matches WHERE seed IS NULL OR round_no IS NULL')->fetchColumn() === 0, 'matches thiếu seed/round.');
$sumPoints = (int)$pdo->query('SELECT COALESCE(SUM(chip_delta), 0) FROM match_players')->fetchColumn();
check($sumPoints === 0, 'Tổng chip_delta của mọi ván phải bằng 0.');
// Ván mới bắt đầu đúng 3 giây sau khi vào phase next.
$checked = 0;
foreach ($phaseAt as $key => $startedMs) {
    [$round, $phase] = explode(':', $key);
    if ($phase === 'next' && isset($phaseAt[($round + 1) . ':dealing'])) {
        $gap = $phaseAt[($round + 1) . ':dealing'] - $startedMs;
        check($gap >= 3000 && $gap <= 4000, "Ván {$round}→" . ($round + 1) . ": khoảng cách next→dealing = {$gap}ms.");
        $checked++;
    }
}
check($checked >= 5, 'Quan sát được quá ít chuyển next→dealing.');

printf(
    "Mô phỏng OK (%s): %d ván, %d request, %d ván có tới trắng, %d treo máy, %d rời giữa ván, %d mất kết nối, %d lần bị đưa ra, "
    . "%d lần vào lại, xu tối đa/ván %d, tổng xu hệ thống giữ nguyên %d.\n",
    zp_driver(),
    $stats['rounds'],
    $requests,
    $stats['whites'],
    $stats['timeouts'],
    $stats['ghosts'],
    $stats['reconnects'],
    $stats['kicks'],
    $stats['rejoins'],
    $stats['maxAbsChips'],
    $systemTotal,
);

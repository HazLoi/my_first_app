<?php
declare(strict_types=1);

require_once __DIR__ . '/../api_zingplay/php/tests/harness.php';
require_once __DIR__ . '/../api_zingplay/php/games/tienlen/TienLenEngine.php';

$config = require __DIR__ . '/../api_zingplay/php/games/tienlen/config.php';
$vectors = json_decode(file_get_contents(__DIR__ . '/tienlen_vectors.json'), true, 512, JSON_THROW_ON_ERROR);
$passed = 0;
$failed = 0;
$assert = static function (bool $ok, string $label) use (&$passed, &$failed): void {
    if ($ok) {
        $passed++;
    } else {
        $failed++;
        fwrite(STDERR, "FAIL: $label\n");
    }
};
$cards = static function (array $tokens): array {
    $suits = ['S' => 'spades', 'C' => 'clubs', 'D' => 'diamonds', 'H' => 'hearts'];
    return array_map(static fn(string $token): array => [
        'rank' => (int)substr($token, 0, -1), 'suit' => $suits[substr($token, -1)],
    ], $tokens);
};
foreach ($vectors['classify'] as $index => $vector) {
    $combo = TienLenRules::classify($cards($vector['cards']));
    $assert(($combo['type'] ?? null) === $vector['type'], "classify $index");
}
foreach ($vectors['beats'] as $index => $vector) {
    $play = TienLenRules::classify($cards($vector['play']));
    $table = TienLenRules::classify($cards($vector['table']));
    $assert($play !== null && $table !== null && TienLenRules::beats($play, $table, $config) === $vector['wins'], "beats $index");
}
foreach ($vectors['suitOrder']['ranks'] as $rank) {
    foreach ($vectors['suitOrder']['suits'] as $index => $suit) {
        $a = TienLenRules::classify($cards([$rank . $suit]));
        $b = TienLenRules::classify($cards([$rank . $vectors['suitOrder']['compareTo']]));
        $assert(TienLenRules::beats($a, $b, $config) === ($index > 0), "suit $rank$suit");
    }
}
$whiteHands = $vectors['white'];
foreach ($whiteHands as $type => $hand) {
    $assert(in_array($type, TienLenRules::whites($cards($hand), $config), true), "white $type");
}
$disabled = $config;
$disabled['whiteEnabled'] = false;
$assert(TienLenRules::whites($cards($whiteHands['dragon']), $disabled) === [], 'white disabled');
$whiteState = TienLenRules::newRound([
    'p1' => $cards(['2S','2C','2D','2H','4S','5C','6D','8H','9S','10C','11D','13H','14S']),
    'p2' => $cards(['3S','3C','3D','3H','4C','5D','6H','8S','9C','10D','11H','13S','14C']),
], null, $config);
$assert($whiteState['whiteWinner'] === 'p1' && $whiteState['whiteType'] === 'four_twos', 'white priority');
$whitePayments = TienLenRules::payments($whiteState, 50, $config);
$assert($whitePayments['p1']['white'] === 150 && $whitePayments['p2']['white'] === -150, 'white payment');
$dragonA = [];
$dragonB = [];
foreach (range(3, 14) as $rank) {
    $dragonA[] = $rank . 'S';
    $dragonB[] = $rank . 'C';
}
$dragonA[] = '2S';
$dragonB[] = '2C';
$tie = TienLenRules::newRound(['a' => $cards($dragonA), 'b' => $cards($dragonB)], null, $config);
$assert($tie['whiteWinner'] === 'b', 'white tie by strength');
$scoreState = [
    'order' => ['a', 'b'], 'whiteWinner' => null, 'ranking' => ['a', 'b'],
    'played' => ['a' => true, 'b' => false],
    'hands' => ['a' => [], 'b' => $cards(['2H'])],
    'chops' => [['from' => 'b', 'to' => 'a', 'target' => TienLenRules::classify($cards(['2S']))]],
];
$score = TienLenRules::payments($scoreState, 50, $config);
$assert($score['a'] === ['rank' => 50, 'chop' => 50, 'cold' => 100, 'rotten' => 100, 'white' => 0]
    && array_sum($score['a']) === -array_sum($score['b']), 'payment components');

mt_srand(73021);
$deck = [];
foreach (range(2, 14) as $rank) {
    foreach (['spades', 'clubs', 'diamonds', 'hearts'] as $suit) {
        $deck[] = ['rank' => $rank, 'suit' => $suit];
    }
}
for ($game = 0; $game < 2000; $game++) {
    shuffle($deck);
    $n = 2 + $game % 3;
    $hands = [];
    for ($i = 0; $i < $n; $i++) {
        $hands['p' . $i] = array_slice($deck, $i * 13, 13);
    }
    $settings = $config;
    $settings['rankMode'] = $game % 2 ? 'full' : 'first-only';
    $state = TienLenRules::newRound($hands, null, $settings);
    $steps = 0;
    while ($state['whiteWinner'] === null && $state['turn'] !== null && $steps < 500) {
        $hand = $state['hands'][$state['turn']];
        $groups = [];
        foreach ($hand as $card) {
            $groups[$card['rank']][] = $card;
        }
        $candidates = array_map(static fn(array $card): array => [$card], $hand);
        foreach ($groups as $group) {
            for ($size = 2; $size <= count($group); $size++) {
                $candidates[] = array_slice($group, 0, $size);
            }
        }
        for ($start = 3; $start <= 12; $start++) {
            $straight = [];
            $pairs = [];
            for ($rank = $start; $rank <= 14 && isset($groups[$rank]); $rank++) {
                $straight[] = $groups[$rank][0];
                if (count($groups[$rank]) >= 2 && count($pairs) === 2 * ($rank - $start)) {
                    $pairs = array_merge($pairs, array_slice($groups[$rank], 0, 2));
                }
                if (count($straight) >= 3) {
                    $candidates[] = $straight;
                }
                if (count($pairs) >= 6) {
                    $candidates[] = $pairs;
                }
            }
        }
        shuffle($candidates);
        $action = $state['table'] === null ? null : ['type' => 'pass'];
        foreach ($candidates as $candidate) {
            $combo = TienLenRules::classify($candidate);
            if ($combo === null || ($state['required'] !== null && !in_array(
                TienLenRules::strength($state['required']), array_map([TienLenRules::class, 'strength'], $candidate), true
            ))) {
                continue;
            }
            if ($state['table'] === null || (mt_rand(0, 2) !== 0 && TienLenRules::beats($combo, $state['table'], $settings))) {
                $action = ['type' => 'play', 'cards' => $candidate];
                break;
            }
        }
        if ($action === null) {
            throw new RuntimeException("Bot không tìm thấy nước đi ở ván $game.");
        }
        TienLenRules::act($state, $state['turn'], $action, $settings);
        $steps++;
    }
    $details = TienLenRules::payments($state, 50, $settings);
    $deltas = array_map('array_sum', $details);
    $balances = array_fill_keys(array_keys($hands), $game % 101);
    $paid = zingplaySettleChips($deltas, $balances);
    $ok = ($state['whiteWinner'] !== null || $state['turn'] === null) && $steps < 500
        && array_sum($deltas) === 0 && array_sum($paid) === 0;
    foreach ($paid as $id => $delta) {
        $ok = $ok && $balances[$id] + $delta >= 0;
    }
    $assert($ok, "simulation $game");
}

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec(zp_sqlite_schema());
$pdo->exec("INSERT INTO users (id,phone,display_name,password_salt,password_hash,balance) VALUES
    ('u1','1','A','','',1000),('u2','2','B','','',1000)");
$pdo->exec("INSERT INTO game_rooms (code,host_player_id,game_type,stake,scoring_mode) VALUES ('ABCDE','p1','tienlen',50,'coins')");
$pdo->exec("INSERT INTO game_room_players (player_id,room_code,user_id,seat_number,display_name,hand_json) VALUES
    ('p1','ABCDE','u1',1,'A','[]'),('p2','ABCDE','u2',2,'B','[]')");
$engine = new TienLenEngine();
$room = zingplay_lock_room($pdo, 'ABCDE');
$players = zingplay_lock_players($pdo, 'ABCDE');
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = ['00000000000000000000000000000000'];
zingplay_transaction($pdo, static function () use ($engine, $pdo, &$room, &$players): void {
    $engine->startRound($pdo, $room, $players, 1000);
});
$view1 = $engine->viewFor($pdo, ['id' => 'u1'], 'ABCDE');
$view2 = $engine->viewFor($pdo, ['id' => 'u2'], 'ABCDE');
$assert(count($view1['cards']) === 13 && count($view2['cards']) === 13
    && $view1['cards'] !== $view2['cards'] && !str_contains(json_encode($view1), 'hands'), 'private hands');
$GLOBALS['ZINGPLAY_NOW'] = 1001;
$engine->advanceIfDue($pdo, $room);
$room = zingplay_lock_room($pdo, 'ABCDE');
$assert($room['phase'] === 'playing', 'dealing transition');
$state = json_decode($room['game_state'], true, 512, JSON_THROW_ON_ERROR);
$current = $state['turn'];
$user = $current === 'p1' ? ['id' => 'u1'] : ['id' => 'u2'];
$invalid = false;
try {
    zingplay_transaction($pdo, static function () use ($engine, $pdo, &$room, &$players, $user): void {
        $engine->applyAction($pdo, $room, $players, $user, ['type' => 'pass'], 1002);
    });
} catch (ApiException) {
    $invalid = true;
}
$assert($invalid, 'cannot pass lead');
$autoObserved = false;
for ($step = 0; $step < 300 && $room['phase'] !== 'summary'; $step++) {
    $GLOBALS['ZINGPLAY_NOW'] = (int)$room['phase_deadline'];
    $engine->advanceIfDue($pdo, $room);
    $room = zingplay_lock_room($pdo, 'ABCDE');
    $currentState = json_decode($room['game_state'], true, 512, JSON_THROW_ON_ERROR);
    $autoObserved = $autoObserved || in_array(true, $currentState['auto'], true);
}
$results = json_decode($room['results_json'], true, 512, JSON_THROW_ON_ERROR);
$assert($room['phase'] === 'summary' && array_sum(array_column($results['players'], 'chips')) === 0, 'timeout settlement');
$assert((int)$pdo->query('SELECT SUM(balance) FROM users')->fetchColumn() === 2000, 'ledger zero sum');
$assert((int)$pdo->query('SELECT COUNT(*) FROM wallet_transactions')->fetchColumn() >= 2, 'ledger persisted');
$assert($autoObserved, 'three timeouts activate bot');
$old = $room;
$old['phase_deadline'] = $GLOBALS['ZINGPLAY_NOW'];
$ledgerCount = (int)$pdo->query('SELECT COUNT(*) FROM wallet_transactions')->fetchColumn();
$assert(!$engine->advanceIfDue($pdo, $old)
    && (int)$pdo->query('SELECT COUNT(*) FROM wallet_transactions')->fetchColumn() === $ledgerCount, 'stale deadline cannot settle twice');
if ($room['phase'] === 'summary') {
    $pdo->exec("UPDATE users SET balance = 0 WHERE id = 'u1'");
    $GLOBALS['ZINGPLAY_NOW'] = (int)$room['phase_deadline'];
    $engine->advanceIfDue($pdo, $room);
    $room = zingplay_lock_room($pdo, 'ABCDE');
    $assert($room['phase'] === 'waiting' && count(zingplay_lock_players($pdo, 'ABCDE')) === 1, 'zero balance removed');
    $message = '';
    try {
        room_poll_version($pdo, ['id' => 'u1'], 'ABCDE', 'tienlen');
    } catch (ApiException $exception) {
        $message = $exception->getMessage();
    }
    $assert(str_contains($message, 'hết xu'), 'removed player notification');
}
unset($GLOBALS['ZINGPLAY_NOW']);

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->sqliteCreateFunction('UTC_TIMESTAMP', static fn(): string => gmdate('Y-m-d H:i:s', zingplay_now()));
$pdo->exec(zp_sqlite_schema());
$GLOBALS['ZINGPLAY_NOW'] = time();
$GLOBALS['ZINGPLAY_SEED_QUEUE'] = ['00000000000000000000000000000000'];
[$alice, $bob, $outsider] = zp_users($pdo, 3);
$created = zp_api($pdo, 'POST', '/rooms', $alice['token'], ['game_type' => 'tienlen', 'stake' => 50]);
$assert($created['status'] === 201, 'API create');
$code = $created['body']['room']['code'];
$joined = zp_api($pdo, 'POST', '/rooms/join', $bob['token'], ['code' => $code, 'game_type' => 'tienlen']);
$assert($joined['status'] === 200, 'API join');
$started = zp_api($pdo, 'POST', "/rooms/$code/start", $alice['token']);
$assert($started['status'] === 200 && $started['body']['room']['phase'] === 'dealing', 'API start');
$unauthorized = zp_api($pdo, 'GET', "/rooms/$code", $outsider['token'], null, ['game_type' => 'tienlen']);
$assert($unauthorized['status'] === 403, 'API private room');
$unchanged = zp_api($pdo, 'GET', "/rooms/$code", $alice['token'], null, [
    'game_type' => 'tienlen', 'since_version' => $started['body']['version'],
]);
$assert(($unchanged['body']['changed'] ?? null) === false, 'API since_version');
$GLOBALS['ZINGPLAY_NOW']++;
$aliceView = zp_api($pdo, 'GET', "/rooms/$code", $alice['token'], null, ['game_type' => 'tienlen']);
$bobView = zp_api($pdo, 'GET', "/rooms/$code", $bob['token'], null, ['game_type' => 'tienlen']);
$currentUser = $aliceView['body']['turn'] === $aliceView['body']['playerId'] ? $alice : $bob;
$otherUser = $currentUser['id'] === $alice['id'] ? $bob : $alice;
$currentView = $currentUser['id'] === $alice['id'] ? $aliceView['body'] : $bobView['body'];
$otherView = $currentUser['id'] === $alice['id'] ? $bobView['body'] : $aliceView['body'];
$wrongTurn = zp_api($pdo, 'POST', "/rooms/$code/action", $otherUser['token'], [
    'type' => 'play', 'cards' => [$otherView['cards'][0]],
]);
$assert($wrongTurn['status'] === 400, 'API wrong turn');
$wrongCard = zp_api($pdo, 'POST', "/rooms/$code/action", $currentUser['token'], [
    'type' => 'play', 'cards' => [$otherView['cards'][0]],
]);
$assert($wrongCard['status'] === 400, 'API rejects other hand');
$played = zp_api($pdo, 'POST', "/rooms/$code/action", $currentUser['token'], [
    'type' => 'play', 'cards' => [$currentView['required']],
]);
$assert($played['status'] === 200 && count($played['body']['cards']) === 12
    && $played['body']['version'] > $aliceView['body']['version'], 'API play and version');
$assert(!str_contains(json_encode($played['body']), '"hands"'), 'API no other hands');
unset($GLOBALS['ZINGPLAY_NOW'], $GLOBALS['ZINGPLAY_SEED_QUEUE']);
echo "Tiến Lên: $passed pass, $failed fail\n";
exit($failed === 0 ? 0 : 1);

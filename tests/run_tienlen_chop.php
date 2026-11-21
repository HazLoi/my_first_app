<?php
declare(strict_types=1);

require_once __DIR__ . '/../api_zingplay/php/games/tienlen/TienLenRules.php';
require_once __DIR__ . '/../api_zingplay/php/games/tienlen/TienLenScoring.php';
require_once __DIR__ . '/../api_zingplay/php/tests/harness.php';
require_once __DIR__ . '/../api_zingplay/php/games/tienlen/TienLenEngine.php';

$base = ['black_two' => 1, 'red_two' => 2, 'four' => 4, 'pairs_run_3' => 3, 'pairs_run_4' => 5];
$pointValues = array_map(static fn(int $value): int => -2 * $value, $base);
$ids = ['A', 'B', 'C', 'D'];
$combo = static function (string $kind): array {
    if ($kind === 'black_two' || $kind === 'red_two') {
        return TienLenRules::classify([['rank' => 2, 'suit' => $kind === 'black_two' ? 'spades' : 'hearts']]);
    }
    if ($kind === 'pair_twos') {
        return TienLenRules::classify([['rank' => 2, 'suit' => 'spades'], ['rank' => 2, 'suit' => 'hearts']]);
    }
    $cards = [];
    if ($kind === 'four') {
        foreach (['spades', 'clubs', 'diamonds', 'hearts'] as $suit) $cards[] = ['rank' => 4, 'suit' => $suit];
    } else {
        $count = $kind === 'pairs_run_3' ? 3 : 4;
        for ($rank = 5; $rank < 5 + $count; $rank++) {
            foreach (['spades', 'hearts'] as $suit) $cards[] = ['rank' => $rank, 'suit' => $suit];
        }
    }
    return TienLenRules::classify($cards);
};
$makeChain = static function (array $targets, int $chainId, int $offset = 0) use ($ids, $combo): array {
    $layers = [];
    foreach ($targets as $index => $target) {
        $candidate = $targets[$index + 1] ?? 'pairs_run_4';
        $layers[] = ['chainId' => $chainId, 'from' => $ids[$index + $offset], 'to' => $ids[$index + $offset + 1],
            'target' => $combo($target), 'combo' => $combo($candidate)];
    }
    return $layers;
};
$vectors = json_decode((string)file_get_contents(__DIR__ . '/tienlen_chop_vectors.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($vectors as $vector) {
    $layers = $makeChain($vector['targets'], 0);
    if (isset($vector['second'])) $layers = array_merge($layers, $makeChain($vector['second'], 1, 1));
    $config = ['rankPoints' => [4 => [0, 0, 0, 0]], 'chopValues' => $pointValues,
        'coldEnabled' => false, 'chopperGains' => true, 'chopOverMode' => $vector['mode'] ?? 'last-pays-all',
        'coverShortfallByEarlierVictims' => $vector['cover'] ?? false];
    $state = ['order' => $ids, 'ranking' => [], 'hands' => [], 'played' => [], 'whiteWinner' => null, 'chops' => $layers];
    $points = TienLenScoring::calculate($state, [], $config, 20);
    $actualPoints = array_map(static fn(string $id): int => $points['details'][$id]['chop'], $ids);
    $balances = array_combine($ids, $vector['balances'] ?? [10000, 10000, 10000, 10000]);
    $coins = TienLenRules::settleChops($layers, $base, 100, $config, $balances);
    $actualCoins = array_map(static fn(string $id): int => $coins['deltas'][$id] ?? 0, $ids);
    if ($actualPoints !== $vector['points'] || $actualCoins !== $vector['coins']) {
        throw new RuntimeException($vector['name'] . ': ' . json_encode([$actualPoints, $actualCoins]));
    }
}

$low = $combo('pairs_run_3')['cards'];
$high = [];
for ($rank = 8; $rank <= 10; $rank++) {
    foreach (['spades', 'hearts'] as $suit) $high[] = ['rank' => $rank, 'suit' => $suit];
}
$state = [
    'order' => $ids, 'turn' => 'B', 'whiteWinner' => null, 'ranking' => [],
    'hands' => ['A' => [['rank' => 3, 'suit' => 'clubs']],
        'B' => array_merge($low, [['rank' => 3, 'suit' => 'spades']]),
        'C' => array_merge($high, [['rank' => 4, 'suit' => 'clubs']]),
        'D' => [['rank' => 4, 'suit' => 'spades']]],
    'required' => null, 'table' => $combo('black_two'), 'lastPlayer' => 'A', 'passed' => [],
    'played' => ['A' => true, 'B' => false, 'C' => false, 'D' => false],
    'cold' => [], 'chops' => [], 'events' => [],
];
$gameConfig = require __DIR__ . '/../api_zingplay/php/games/tienlen/config.php';
TienLenRules::act($state, 'B', ['type' => 'play', 'cards' => $low], $gameConfig);
TienLenRules::act($state, 'C', ['type' => 'play', 'cards' => $high], $gameConfig);
if (count($state['chops']) !== 2 || $state['chops'][0]['chainId'] !== $state['chops'][1]['chainId']
    || count(TienLenRules::chopChains($state['chops'])) !== 1) {
    throw new RuntimeException('Không nhận diện chuỗi chặt đè khi đánh bài.');
}

foreach ([false, true] as $cover) {
    $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec(zp_sqlite_schema());
    $players = [];
    foreach ($ids as $index => $id) {
        $insert = $pdo->prepare('INSERT INTO users (id, phone, display_name, password_salt, password_hash, balance) VALUES (?, ?, ?, ?, ?, ?)');
        $insert->execute([$id, $id, $id, '', '', $id === 'B' ? 50 : 1000]);
        $players[] = ['player_id' => $id, 'user_id' => $id, 'display_name' => $id];
    }
    $round = ['order' => $ids, 'ranking' => $ids, 'whiteWinner' => null, 'hands' => array_fill_keys($ids, []),
        'played' => array_fill_keys($ids, true), 'chops' => $makeChain(['black_two', 'pairs_run_3'], 0)];
    $table = ['game_state' => json_encode($round, JSON_THROW_ON_ERROR), 'scoring_mode' => 'coins',
        'scoring_config' => json_encode(['coverShortfallByEarlierVictims' => $cover], JSON_THROW_ON_ERROR),
        'stake' => 100, 'code' => 'TEST'];
    $engine = new TienLenEngine();
    $result = $engine->settle($pdo, $table, $players, time());
    $chips = array_column($result['players'], 'chips');
    $expected = $cover ? [-50, -50, 300, -200] : [200, -50, 50, -200];
    if ($chips !== $expected || array_sum($chips) !== 0 || count($result['chopChains']) !== 1) {
        throw new RuntimeException('Thanh toán thực tế không khớp: ' . json_encode($chips));
    }
}

mt_srand(5031);
for ($round = 0; $round < 2000; $round++) {
    $chops = [];
    for ($chain = 0, $n = mt_rand(1, 4); $chain < $n; $chain++) {
        $targets = [];
        for ($layer = 0, $length = mt_rand(1, 3); $layer < $length; $layer++) {
            $targets[] = array_keys($base)[mt_rand(0, count($base) - 1)];
        }
        $chops = array_merge($chops, $makeChain($targets, $chain));
    }
    $config = ['chopOverMode' => mt_rand(0, 1) ? 'stack' : 'last-pays-all',
        'coverShortfallByEarlierVictims' => (bool)mt_rand(0, 1)];
    $balances = array_combine($ids, array_map(static fn(): int => mt_rand(0, 1000), $ids));
    $initial = $balances;
    $result = TienLenRules::settleChops($chops, $base, 100, $config, $balances);
    if (array_sum($result['deltas']) !== 0 || min($balances) < 0 || array_sum($balances) !== array_sum($initial)) {
        throw new RuntimeException("Tổng xu không bảo toàn ở ván $round.");
    }
    $points = TienLenRules::settleChops($chops, $base, 2, $config);
    if (array_sum($points['deltas']) !== 0) throw new RuntimeException("Tổng điểm chặt không bảo toàn ở ván $round.");
}
echo 'Chặt Tiến Lên: ' . count($vectors) . " vector và 2000 ván ngẫu nhiên đạt.\n";

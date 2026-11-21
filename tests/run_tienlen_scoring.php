<?php
declare(strict_types=1);

require_once __DIR__ . '/../api_zingplay/php/games/tienlen/TienLenRules.php';
require_once __DIR__ . '/../api_zingplay/php/games/tienlen/TienLenScoring.php';

$vectors = json_decode((string)file_get_contents(__DIR__ . '/tienlen_scoring_vectors.json'), true, 512, JSON_THROW_ON_ERROR);
$config = [
    'rankPoints' => [2 => [1, 0], 3 => [2, 1, 0], 4 => [3, 2, 1, 0]],
    'chopValues' => ['black_two' => -2, 'red_two' => -4, 'four' => -8, 'pairs_run_3' => -6, 'pairs_run_4' => -10],
    'chopperGains' => true,
    'bonusPerOpponent' => 2,
    'coldEnabled' => true,
    'coldPenalty' => -3,
    'rottenEnabled' => false,
];

$combo = static function (string $type): array {
    return match ($type) {
        'black_two' => ['type' => 'single', 'count' => 1, 'strength' => 1, 'cards' => [['rank' => 2, 'suit' => 'spades']]],
        'red_two' => ['type' => 'single', 'count' => 1, 'strength' => 1, 'cards' => [['rank' => 2, 'suit' => 'hearts']]],
        'pair_twos' => ['type' => 'pair', 'count' => 2, 'strength' => 1, 'cards' => [['rank' => 2, 'suit' => 'spades'], ['rank' => 2, 'suit' => 'hearts']]],
        'four' => ['type' => 'four', 'count' => 4, 'strength' => 1, 'cards' => [['rank' => 4, 'suit' => 'spades'], ['rank' => 4, 'suit' => 'clubs'], ['rank' => 4, 'suit' => 'diamonds'], ['rank' => 4, 'suit' => 'hearts']]],
        'pairs_run_3' => ['type' => 'pairs_run', 'count' => 6, 'strength' => 1, 'cards' => [['rank' => 3, 'suit' => 'spades'], ['rank' => 3, 'suit' => 'hearts'], ['rank' => 4, 'suit' => 'spades'], ['rank' => 4, 'suit' => 'hearts'], ['rank' => 5, 'suit' => 'spades'], ['rank' => 5, 'suit' => 'hearts']]],
        'pairs_run_4' => ['type' => 'pairs_run', 'count' => 8, 'strength' => 1, 'cards' => [['rank' => 3, 'suit' => 'spades'], ['rank' => 3, 'suit' => 'hearts'], ['rank' => 4, 'suit' => 'spades'], ['rank' => 4, 'suit' => 'hearts'], ['rank' => 5, 'suit' => 'spades'], ['rank' => 5, 'suit' => 'hearts'], ['rank' => 6, 'suit' => 'spades'], ['rank' => 6, 'suit' => 'hearts']]],
    };
};

$passed = 0;
foreach ($vectors as $vector) {
    $count = (int)$vector['count'];
    $ids = array_map(static fn(int $i): string => 'p' . $i, range(0, $count - 1));
    $settings = $config;
    if (isset($vector['rankPoints'])) $settings['rankPoints'][$count] = array_map('intval', $vector['rankPoints']);
    if (isset($vector['chopValues'])) $settings['chopValues'] = array_replace($settings['chopValues'], $vector['chopValues']);
    if (isset($vector['chopperGains'])) $settings['chopperGains'] = (bool)$vector['chopperGains'];
    if (isset($vector['coldEnabled'])) $settings['coldEnabled'] = (bool)$vector['coldEnabled'];
    if (isset($vector['coldPenalty'])) $settings['coldPenalty'] = (int)$vector['coldPenalty'];
    if (isset($vector['bonusPerOpponent'])) $settings['bonusPerOpponent'] = (int)$vector['bonusPerOpponent'];
    $settings['rottenEnabled'] = isset($vector['rotten']);

    $hands = [];
    $played = [];
    foreach ($ids as $i => $id) {
        $hands[$id] = [['rank' => 3, 'suit' => 'spades']];
        $played[$id] = true;
    }
    $ranking = array_map(static fn(int $i): string => $ids[$i], $vector['ranking'] ?? []);
    $cold = array_map(static fn(int $i): string => $ids[$i], $vector['cold'] ?? []);
    foreach ($cold as $id) {
        $hands[$id] = array_fill(0, 13, ['rank' => 3, 'suit' => 'spades']);
        $played[$id] = false;
    }
    if (isset($vector['rotten'])) {
        $loser = $ids[(int)$vector['rotten'][0]];
        $kind = $vector['rotten'][1];
        $hands[$loser] = $kind === 'pair_twos'
            ? [['rank' => 2, 'suit' => 'spades'], ['rank' => 2, 'suit' => 'hearts']]
            : [['rank' => 2, 'suit' => $kind === 'black_two' ? 'spades' : 'hearts']];
    }
    $chops = [];
    $chain = $vector['chopChain'] ?? null;
    if (isset($vector['chopSequence'])) {
        foreach ($vector['chopSequence'] as $index => [$target, $candidate]) {
            $event = [
                'from' => $ids[$index] ?? $ids[0],
                'to' => $ids[$index + 1] ?? $ids[count($ids) - 1],
                'target' => $combo($target),
            ];
            if ($candidate !== null) $event['combo'] = $combo($candidate);
            $chops[] = $event;
        }
    } elseif (is_array($chain)) {
        $from = $ids[0];
        foreach ($chain as $index => $kind) {
            $to = $ids[min($count - 1, $index + 1)];
            $event = ['from' => $from, 'to' => $to, 'target' => $combo($kind)];
            if (isset($chain[$index + 1])) {
                $event['combo'] = $combo($chain[$index + 1]);
            }
            $chops[] = $event;
            $from = $to;
        }
    } elseif (isset($vector['chop'][0])) {
        $kind = $vector['chop'][0];
        $chops[] = ['from' => $ids[1] ?? $ids[0], 'to' => $ids[2] ?? $ids[0], 'target' => $combo($kind)];
    }
    $white = array_key_exists('white', $vector) ? $ids[(int)$vector['white']] : null;
    $state = [
        'order' => $ids,
        'ranking' => $ranking,
        'hands' => $hands,
        'played' => $played,
        'chops' => $chops,
        'whiteWinner' => $white,
    ];
    $matchTotals = [];
    foreach ($ids as $i => $id) {
        $matchTotals[$id] = (int)($vector['matchTotals'][$i] ?? 0);
    }
    $result = TienLenScoring::calculate($state, $matchTotals, $settings, (int)($vector['target'] ?? 20));
    $actual = [];
    foreach ($ids as $id) {
        $actual[] = isset($vector['matchTotals'])
            ? $result['totals'][$id]
            : $result['totals'][$id] - (int)($matchTotals[$id] ?? 0);
    }
    if ($actual !== $vector['expected']) {
        throw new RuntimeException($vector['name'] . ': mong ' . json_encode($vector['expected']) . ', nhận ' . json_encode($actual));
    }
    if (isset($vector['matchEnded']) && $result['matchEnded'] !== $vector['matchEnded']) {
        throw new RuntimeException($vector['name'] . ': trạng thái kết thúc trận không khớp.');
    }
    if (isset($vector['tie'])) {
        $actualTie = array_map(static fn(string $id): int => (int)substr($id, 1), $result['matchTieIds']);
        if ($actualTie !== $vector['tie']) {
            throw new RuntimeException($vector['name'] . ': danh sách hòa trận không khớp.');
        }
    }
    if (isset($vector['matchWinner'])) {
        $actualWinner = $result['matchTieIds'] === [] ? null : (int)substr($result['matchTieIds'][0], 1);
        if ($actualWinner !== $vector['matchWinner']) {
            throw new RuntimeException($vector['name'] . ': người thắng trận không khớp.');
        }
    }
    $passed++;
}
if ($passed < 40) {
    throw new RuntimeException("Cần ít nhất 40 vector, hiện có $passed.");
}

$ruleConfig = ['rankMode' => 'full', 'coldElimination' => true];
$state = [
    'order' => ['p1', 'p2', 'p3'],
    'turn' => 'p1',
    'whiteWinner' => null,
    'ranking' => [],
    'hands' => [
        'p1' => [['rank' => 3, 'suit' => 'spades']],
        'p2' => array_merge(
            [['rank' => 4, 'suit' => 'spades']],
            array_map(static fn(int $i): array => ['rank' => 5 + intdiv($i, 4), 'suit' => ['spades', 'clubs', 'diamonds', 'hearts'][$i % 4]], range(0, 11))
        ),
        'p3' => [['rank' => 4, 'suit' => 'hearts']],
    ],
    'required' => null,
    'table' => null,
    'lastPlayer' => 'p1',
    'passed' => [],
    'played' => ['p1' => false, 'p2' => false, 'p3' => false],
    'cold' => [],
    'chops' => [],
    'events' => [],
];
TienLenRules::act($state, 'p1', ['type' => 'play', 'cards' => $state['hands']['p1']], $ruleConfig);
if ($state['cold'] !== ['p2'] || $state['ranking'] !== ['p1', 'p3', 'p2'] || $state['turn'] !== null) {
    throw new RuntimeException('Người còn nguyên 13 lá không bị loại khỏi ván ngay sau khi có người về nhất.');
}
$passed++;
echo "Tiến Lên scoring: $passed kiểm tra đạt.\n";

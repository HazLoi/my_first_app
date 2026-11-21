<?php
declare(strict_types=1);

// Sinh tests/vectors.json từ chính các hàm PHP (nguồn sự thật của luật) để bản TypeScript đối chiếu.
//   php api_zingplay/php/tests/generate_vectors.php
// Kết quả xác định (không phụ thuộc thời gian/ngẫu nhiên hệ thống): chạy lại cho cùng một file.

require_once __DIR__ . '/../rules.php';

final class VectorRng
{
    private int $counter = 0;

    public function __construct(private string $seed)
    {
    }

    public function int(int $max): int
    {
        return unpack('N', substr(hash('sha256', $this->seed . '#' . $this->counter++, true), 0, 4))[1] % $max;
    }

    public function range(int $min, int $max): int
    {
        return $min + $this->int($max - $min + 1);
    }

    public function pick(array $items): mixed
    {
        return $items[$this->int(count($items))];
    }

    public function shuffle(array $items): array
    {
        for ($index = count($items) - 1; $index > 0; $index--) {
            $swap = $this->int($index + 1);
            [$items[$index], $items[$swap]] = [$items[$swap], $items[$index]];
        }
        return $items;
    }
}

$rng = new VectorRng('zingplay-vectors-v2');
$suitCodes = array_keys(ZINGPLAY_SUITS);

$card = static function (string $suit, int $value): array {
    return [
        'id' => $suit . '-' . $value,
        'suit' => ZINGPLAY_SUITS[$suit],
        'value' => $value,
        'label' => zingplayRankLabel($value),
    ];
};
$parse = static function (string $spec) use ($card): array {
    $suits = ['c' => 'clubs', 'd' => 'diamonds', 'h' => 'hearts', 's' => 'spades'];
    $faces = ['J' => 11, 'Q' => 12, 'K' => 13, 'A' => 14];
    $cards = [];
    foreach (preg_split('/\s+/', trim($spec)) as $token) {
        $rank = substr($token, 0, -1);
        $cards[] = $card($suits[substr($token, -1)], $faces[$rank] ?? (int)$rank);
    }
    return $cards;
};
$deckFor = static fn(string $label): array => zingplayShuffleWithSeed(substr(hash('sha256', 'deck:' . $label), 0, 32));
// Gán chất ngẫu nhiên, không trùng, cho danh sách rank (một rank có thể lặp).
$assignSuits = static function (array $ranks) use ($rng, $suitCodes, $card): array {
    $used = [];
    $cards = [];
    foreach ($ranks as $rank) {
        $free = array_values(array_filter($suitCodes, static fn(string $suit): bool => !isset($used[$suit . $rank])));
        $suit = $rng->pick($free);
        $used[$suit . $rank] = true;
        $cards[] = $card($suit, $rank);
    }
    return $rng->shuffle($cards);
};
$straightRanks = static fn(int $start, int $length): array => zingplayStraightRanks($start, $length);
$handEntry = static function (array $cards): array {
    $evaluation = zingplayEvaluate($cards);
    return ['cards' => $cards] + $evaluation;
};

// ---------------------------------------------------------------- hands
$hands = [];
$edgeHands = [
    '2c 5d 9h', 'Kc Qd 3h', 'Ac 2d 3h', '4c 4d 9h', '4c 4d Kh', '7c 7d 7h', 'Ac Ad Ah', '2c 2d 3h',
    '2c 5d 9h Jc 4s', 'Ac Kd 9h 4c 2s', '2c 2d 9h Jc 4s', 'Kc Kd 9h 9c 4s', 'Kc Kd 4h 4c 2s', '7c 7d 7h Ac 4s', '7c 7d 7h Ac Kd',
    'Ac 2d 3h 4c 5s', '2c 3d 4h 5c 6s', '10c Jd Qh Kc As', '9c 10d Jh Qc Ks', '2h 5h 9h Jh Ah', '2h 5h 9h 10h Kh', '3h 4h 5h 6h 8h',
    '4c 4d 4h 9c 9s', '4c 4d 4h 2c 2s', 'Ac Ad Ah Kc Ks', 'Qc Qd Qh Qs 9s', 'Qc Qd Qh Qs Ks', '2c 2d 2h 2s 3s',
    'Ah 2h 3h 4h 5h', '10s Js Qs Ks As', '5s 6s 7s 8s 9s', '2c 3c 4c 5c 7c',
];
foreach ($edgeHands as $spec) {
    $hands[] = $handEntry($parse($spec));
}
$randomHand5 = static function (int $category) use ($rng, $suitCodes, $card, $assignSuits, $straightRanks, $deckFor): array {
    switch ($category) {
        case 4:
        case 8:
            $ranks = $straightRanks($rng->range(1, 10), 5);
            if ($category === 8) {
                $suit = $rng->pick($suitCodes);
                return array_map(static fn(int $rank): array => $card($suit, $rank), $ranks);
            }
            do {
                $cards = $assignSuits($ranks);
            } while (count(array_unique(array_column($cards, 'suit'))) === 1);
            return $cards;
        case 5:
            do {
                $suit = $rng->pick($suitCodes);
                $ranks = array_slice($rng->shuffle(range(2, 14)), 0, 5);
                sort($ranks);
                $isStraight = $ranks === range($ranks[0], $ranks[0] + 4) || $ranks === [2, 3, 4, 5, 14];
            } while ($isStraight);
            return array_map(static fn(int $rank): array => $card($suit, $rank), $ranks);
        case 6:
            [$trips, $pair] = array_slice($rng->shuffle(range(2, 14)), 0, 2);
            return $assignSuits([$trips, $trips, $trips, $pair, $pair]);
        case 7:
            [$quad, $kicker] = array_slice($rng->shuffle(range(2, 14)), 0, 2);
            return $assignSuits([$quad, $quad, $quad, $quad, $kicker]);
        default:
            for ($attempt = 0; $attempt < 500; $attempt++) {
                $cards = array_slice($deckFor('h5-' . $category . '-' . $rng->int(1000000) . '-' . $attempt), 0, 5);
                if (zingplayEvaluate($cards)['category'] === $category) {
                    return $cards;
                }
            }
            throw new RuntimeException('Không dựng được hand loại ' . $category);
    }
};
foreach (range(0, 8) as $category) {
    for ($index = 0; $index < 9; $index++) {
        $hands[] = $handEntry($randomHand5($category));
    }
}
for ($index = 0; $index < 45; $index++) {
    $three = array_slice($deckFor('h3-' . $index), 0, 3);
    if ($index % 9 === 0) {
        $rank = $rng->range(2, 14);
        $three = $assignSuits([$rank, $rank, $rank]);
    }
    $hands[] = $handEntry($three);
}

// ---------------------------------------------------------------- compare
$compare = [];
$comparePairs = [
    ['Ac 2d 3h 4c 5s', '2c 3d 4h 5c 6s'], ['10c Jd Qh Kc As', 'Ac 2d 3h 4c 5s'], ['9c 9d Kh 3c 2s', '9h 9s Qd 3d 2c'],
    ['9c 9d Kh 3c 2s', '9h 9s Kd 3d 2c'], ['9c 9d Kh 4c 2s', '9h 9s Kd 3d 2c'], ['4c 4d 4h 9c 9s', '5c 5d 5h 2c 2s'],
    ['2h 5h 9h Jh Ah', '3d 5d 9d Jd Ah'], ['2h 5h 9h Jh Ah', '2d 5d 9d Jd Kd'], ['Qc Qd Qh Qs 9s', 'Qc Qd Qh Qs Ks'],
    ['Ah 2h 3h 4h 5h', '2s 3s 4s 5s 6s'], ['5s 6s 7s 8s 9s', 'Qc Qd Qh Qs Ks'], ['7c 7d 7h Ac 4s', '7c 7d 7h Ac 4d'],
    ['2c 5d 9h', '2d 5h 9c'], ['2c 5d 9h', '3c 4d 9s'], ['4c 4d 9h', '4h 4s 8d'], ['7c 7d 7h', 'Ac Ad Kh'], ['7c 7d 7h', '8c 8d 8h'],
    ['2c 2d 3h', '2h 2s 4d'], ['Ac Kd 3h', 'Ac Kd 2h'], ['Ac Ad 2h', '2c 2d 2h'],
    ['2c 5d 9h', '2d 5h 9c Jc 4s'], ['9c 9d 4h', '9h 9s 4d 3c 2s'], ['9c 9d 4h', '9h 9s 6d 5c 3s'], ['7c 7d 7h', '7h 7s 7d Ac 4d'],
    ['Kc Qd 3h', 'Kd Qh 3c 2c 4s'],
    ['2h 5h 9h Jh Ah', '2d 5d 9d Jd Ad'], ['3c 4d 5h 6c 7s', '3d 4h 5s 6d 7c'], ['Ac 2d 3h 4c 5s', 'Ad 2h 3s 4d 5c'],
    ['Kc Kd 9h 9c 4s', 'Kh Ks 9d 9s 4c'], ['4c 4d 4h 9c 9s', '4s 4d 4h 9h 9d'], ['Qc Qd Qh Qs 9s', 'Qc Qd Qh Qs 9d'],
    ['Ac Kd 3h', 'As Kh 3c'], ['7c 7d 7h', '7c 7s 7h'],
];
foreach ($comparePairs as [$left, $right]) {
    $a = $parse($left);
    $b = $parse($right);
    $compare[] = ['a' => $a, 'b' => $b, 'result' => zingplayCompareHands($a, $b)];
}
for ($index = 0; $index < 90; $index++) {
    $size = $index % 4 === 0 ? 3 : 5;
    if ($size === 3) {
        $a = array_slice($deckFor('c3a-' . $index), 0, 3);
        $b = array_slice($deckFor('c3b-' . $index), 0, 3);
    } else {
        $category = $rng->range(0, 8);
        $a = $randomHand5($rng->int(3) === 0 ? $category : $rng->range(0, 5));
        $b = $randomHand5($rng->int(3) === 0 ? $category : $rng->range(0, 5));
    }
    $compare[] = ['a' => $a, 'b' => $b, 'result' => zingplayCompareHands($a, $b)];
}

// ---------------------------------------------------------------- shuffle
$shuffle = [];
$shuffleSeeds = ['00000000000000000000000000000000', 'ffffffffffffffffffffffffffffffff', '00112233445566778899aabbccddeeff',
    'ffeeddccbbaa99887766554433221100', '0123456789abcdef0123456789abcdef'];
for ($index = 0; $index < 110; $index++) {
    $shuffleSeeds[] = substr(hash('sha256', 'shuffle-seed-' . $index), 0, 32);
}
foreach ($shuffleSeeds as $seed) {
    $shuffle[] = ['seed' => $seed, 'deck' => array_column(zingplayShuffleWithSeed($seed), 'id')];
}

// ---------------------------------------------------------------- autoArrange / arrangements
$ids = static fn(array $cards): array => array_column($cards, 'id');
$randomHand13 = static fn(string $label): array => array_slice($deckFor('h13-' . $label), 0, 13);
$autoArrange = [];
$arrangements = [];
for ($index = 0; $index < 130; $index++) {
    $hand = $randomHand13('auto-' . $index);
    $arrangement = zingplayAutoArrange($hand);
    $autoArrange[] = ['hand' => $hand, 'arrangement' => $arrangement];
    // Mỗi tay bài sinh một bố cục hợp lệ (tự xếp) và một bố cục ngẫu nhiên (có thể binh lủng).
    $arrangements[] = ['hand' => $hand, 'arrangement' => $arrangement, 'valid' => zingplayValidateArrangement($hand, $arrangement)['valid']];
    $order = $rng->shuffle($ids($hand));
    $random = ['front' => array_slice($order, 0, 3), 'middle' => array_slice($order, 3, 5), 'back' => array_slice($order, 8, 5)];
    $arrangements[] = ['hand' => $hand, 'arrangement' => $random, 'valid' => zingplayValidateArrangement($hand, $random)['valid']];
}
// Các trường hợp không hợp lệ không phải do binh lủng.
$sample = $randomHand13('invalid');
$good = zingplayAutoArrange($sample);
$badCases = [
    ['front' => array_slice($good['front'], 0, 2), 'middle' => $good['middle'], 'back' => array_merge($good['back'], [$good['front'][2]])],
    ['front' => [$good['front'][0], $good['front'][0], $good['front'][1]], 'middle' => $good['middle'], 'back' => $good['back']],
    ['front' => $good['front'], 'middle' => $good['middle'], 'back' => array_merge(array_slice($good['back'], 0, 4), ['hearts-99'])],
    ['front' => $good['front'], 'middle' => $good['middle']],
    ['front' => $good['back'], 'middle' => $good['middle'], 'back' => $good['front']],
];
foreach ($badCases as $arrangement) {
    $arrangements[] = ['hand' => $sample, 'arrangement' => $arrangement, 'valid' => zingplayValidateArrangement($sample, $arrangement)['valid']];
}

// ---------------------------------------------------------------- white
$white = [];
$whiteBuilders = [
    'rong_cuon' => static function () use ($rng, $suitCodes, $card): array {
        $suit = $rng->pick($suitCodes);
        return $rng->shuffle(array_map(static fn(int $value): array => $card($suit, $value), range(2, 14)));
    },
    'sanh_rong' => static fn(): array => $assignSuits(range(2, 14)),
    'cung_mau_13' => static function () use ($rng, $card): array {
        $suits = $rng->pick([['hearts', 'diamonds'], ['spades', 'clubs']]);
        $pool = [];
        foreach ($suits as $suit) {
            foreach (range(2, 14) as $value) {
                $pool[] = $card($suit, $value);
            }
        }
        return array_slice($rng->shuffle($pool), 0, 13);
    },
    'cung_mau_12' => static function () use ($rng, $card): array {
        [$main, $other] = $rng->pick([[['hearts', 'diamonds'], ['spades', 'clubs']], [['spades', 'clubs'], ['hearts', 'diamonds']]]);
        $pool = [];
        foreach ($main as $suit) {
            foreach (range(2, 14) as $value) {
                $pool[] = $card($suit, $value);
            }
        }
        $odd = $card($rng->pick($other), $rng->range(2, 14));
        return $rng->shuffle(array_merge(array_slice($rng->shuffle($pool), 0, 12), [$odd]));
    },
    'sau_doi' => static function () use ($rng, $assignSuits): array {
        $ranks = $rng->shuffle(range(2, 14));
        $groups = array_slice($ranks, 0, 6);
        $cards = [];
        foreach ($groups as $rank) {
            $cards[] = [$rank, $rank];
        }
        $flat = array_merge(...$cards);
        $flat[] = $ranks[6];
        return $assignSuits($flat);
    },
    'ba_sanh' => static function () use ($rng, $assignSuits, $straightRanks): array {
        return $assignSuits(array_merge(
            $straightRanks($rng->range(1, 12), 3),
            $straightRanks($rng->range(1, 10), 5),
            $straightRanks($rng->range(1, 10), 5),
        ));
    },
    'ba_thung' => static function () use ($rng, $suitCodes, $card): array {
        $shape = $rng->pick([[8, 5], [10, 3], [5, 5, 3]]);
        $suits = $rng->shuffle($suitCodes);
        $cards = [];
        foreach ($shape as $index => $size) {
            foreach (array_slice($rng->shuffle(range(2, 14)), 0, $size) as $value) {
                $cards[] = $card($suits[$index], $value);
            }
        }
        return $rng->shuffle($cards);
    },
];
foreach ($whiteBuilders as $builder) {
    for ($index = 0; $index < 14; $index++) {
        $cards = $builder();
        $white[] = ['cards' => $cards, 'type' => zingplayDetectWhite($cards)];
    }
}
$whiteEdges = [
    '2h 3h 4h 5h 6h 7h 8h 2d 3d 4d 5d 2c 3s', 'Kc Ad 2s 3c 4d 5h 6s 7c 3d 4h 5s 6c 7d', '6c 6d 7c 7h 8d 8s 9c 9h 10d 10s Jc Kh Ac',
    '2s 5s 9s Ks Qs 3s 7s 8s Js 4h 9h Jh Ah', '2s 5s 9s Ks Qs 3s 7s 2h 4h 9h Jh Ah Kh', '4c 4d 4h 4s 2c 2d 3c 3d 5c 5d 6c 6d Kh',
    '5c 5d 5h 6c 6d 7c 7h 8d 8s 9c 9h 10c 10d', 'Ac 2d 3h Ad 2c 3s 4h 5d 10c Js Qh Kd Ah', 'Qc Kd As 2c 3d 4h 5s 6c 2h 3s 4d 5c 6h',
    '2h 3h 4h 5h 6h 7h 8h 9d 10d Jd Qd Kd Ad', '2s 3s 5s 6s 8s 9s Js Qs Ks As 2h 3h 4h',
];
foreach ($whiteEdges as $spec) {
    $cards = $parse($spec);
    $white[] = ['cards' => $cards, 'type' => zingplayDetectWhite($cards)];
}
for ($index = 0; $index < 30; $index++) {
    $cards = $randomHand13('white-null-' . $index);
    $white[] = ['cards' => $cards, 'type' => zingplayDetectWhite($cards)];
}

// ---------------------------------------------------------------- scoring
$toHands = static function (array $cards): array {
    $arrangement = zingplayAutoArrange($cards);
    $byId = array_column($cards, null, 'id');
    return array_map(static fn(array $pile): array => array_map(static fn(string $id): array => $byId[$id], $pile), $arrangement);
};
$scoring = [];
$addScoring = static function (array $players) use (&$scoring): void {
    $results = zingplayCompareResults($players);
    $reduced = [];
    $pairs = [];
    foreach ($results as $result) {
        $reduced[] = [
            'id' => $result['id'],
            'points' => $result['points'],
            'bonus' => $result['bonus'],
            'sapLang' => $result['sapLang'],
            'white' => $result['white'],
            'chi' => array_map(static fn(array $chi): array => [
                'outcome' => $chi['outcome'],
                'label' => $chi['label'],
                'hand' => $chi['hand'],
                'points' => $chi['points'],
            ], $result['chi']),
        ];
        $pairs[$result['id']] = $result['pairs'];
    }
    $scoring[] = ['players' => array_map(static fn(array $player): array => [
        'id' => $player['id'],
        'name' => $player['name'],
        'hands' => $player['hands'],
    ], $players), 'results' => $reduced, 'pairs' => $pairs];
};
$player = static fn(string $id, array $hands): array => ['id' => $id, 'name' => 'Người ' . $id, 'hands' => $hands];
// Ván thường 2–4 người từ bài ngẫu nhiên.
for ($game = 0; $game < 60; $game++) {
    $size = 2 + $game % 3;
    $deck = $deckFor('score-' . $game);
    $players = [];
    for ($index = 0; $index < $size; $index++) {
        $players[] = $player('p' . ($index + 1), $toHands(array_slice($deck, $index * 13, 13)));
    }
    $addScoring($players);
}
// Sập hầm, sập làng (3 và 4 người), hòa.
$ladder = static fn(int $base, int $kickerPair): array => [
    'front' => [$card('spades', $base), $card('hearts', min(14, $base + 1)), $card('diamonds', 2)],
    'middle' => [$card('spades', $base), $card('hearts', $base), $card('diamonds', 4), $card('clubs', 6), $card('spades', 7)],
    'back' => [$card('spades', $base), $card('hearts', $base), $card('diamonds', $base), $card('clubs', $kickerPair), $card('spades', $kickerPair)],
];
$addScoring([$player('a', $ladder(13, 10)), $player('b', $ladder(9, 10))]);
$addScoring([$player('a', $ladder(13, 10)), $player('b', $ladder(9, 10)), $player('c', $ladder(5, 10))]);
$addScoring([$player('a', $ladder(13, 2)), $player('b', $ladder(11, 3)), $player('c', $ladder(8, 4)), $player('d', $ladder(5, 6))]);
$addScoring([$player('a', $ladder(5, 10)), $player('b', $ladder(13, 10)), $player('c', $ladder(9, 10))]);
$identical = [
    'front' => $parse('2c 5d 9h'), 'middle' => $parse('3c 3d 7h 8c Jd'), 'back' => $parse('Ac Ad 4h 4c Ks'),
];
$identicalOther = [
    'front' => $parse('2d 5c 9s'), 'middle' => $parse('3h 3s 7c 8d Jh'), 'back' => $parse('Ah As 4d 4s Kc'),
];
$addScoring([$player('a', $identical), $player('b', $identicalOther)]);
$addScoring([$player('a', $identical), $player('b', $identicalOther), $player('c', $ladder(13, 10))]);
$sapHamOnly = [
    'front' => $parse('9c 7d 4h'), 'middle' => $parse('10c 10d 4s 6c 7s'), 'back' => $parse('5c 5d 5h 5s 9s'),
];
$loser = [
    'front' => $parse('8c 6d 3h'), 'middle' => $parse('Jc Jd 6s 4c 2s'), 'back' => $parse('Ac Ad Ah 10c 8s'),
];
$addScoring([$player('a', $sapHamOnly), $player('b', $loser)]);
// Tới trắng mọi loại: người thắng là người đầu tiên, còn lại là bài thường; thêm ván trắng đối trắng.
foreach ($whiteBuilders as $key => $builder) {
    for ($variant = 0; $variant < 3; $variant++) {
        $cards = $builder();
        $others = [];
        $size = 2 + $variant;
        for ($index = 1; $index < $size; $index++) {
            $others[] = $player('p' . ($index + 1), $toHands(array_slice($deckFor('white-score-' . $key . '-' . $variant . '-' . $index), 0, 13)));
        }
        $addScoring(array_merge([$player('p1', $toHands($cards))], $others));
    }
}
$typeKeys = array_keys($whiteBuilders);
foreach ($typeKeys as $index => $key) {
    $other = $typeKeys[($index + 2) % count($typeKeys)];
    $addScoring([
        $player('p1', $toHands($whiteBuilders[$key]())),
        $player('p2', $toHands($whiteBuilders[$other]())),
        $player('p3', $toHands(array_slice($deckFor('white-vs-' . $key), 0, 13))),
    ]);
}
$twin = $whiteBuilders['sau_doi']();
$addScoring([$player('p1', $toHands($twin)), $player('p2', $toHands($whiteBuilders['sau_doi']()))]);

$vectors = [
    'hands' => $hands,
    'compare' => $compare,
    'arrangements' => $arrangements,
    'white' => $white,
    'scoring' => $scoring,
    'shuffle' => $shuffle,
    'autoArrange' => $autoArrange,
];

$groups = [];
foreach ($vectors as $name => $items) {
    $encoded = array_map(
        static fn(array $item): string => '    ' . json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        $items,
    );
    $groups[] = '  ' . json_encode($name) . ": [\n" . implode(",\n", $encoded) . "\n  ]";
}
$output = "{\n" . implode(",\n", $groups) . "\n}\n";
$target = dirname(__DIR__, 3) . '/tests/vectors.json';
if (!is_dir(dirname($target))) {
    mkdir(dirname($target), 0775, true);
}
file_put_contents($target, $output);
$counts = array_map('count', $vectors);
fwrite(STDOUT, 'Đã ghi ' . $target . ' (' . number_format(strlen($output)) . " byte): " . json_encode($counts) . "\n");

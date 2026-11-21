<?php
declare(strict_types=1);

require_once __DIR__ . '/../rules.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}


$makeCards = static function (array $specs): array {
    return array_map(static fn(array $spec, int $index): array => [
        'id' => (string)$index,
        'value' => $spec[0],
        'suit' => $spec[1],
        'label' => (string)$spec[0],
    ], $specs, array_keys($specs));
};
$wheel = $makeCards([[14, '♠'], [2, '♥'], [3, '♦'], [4, '♣'], [5, '♠']]);
$sixHigh = $makeCards([[2, '♠'], [3, '♥'], [4, '♦'], [5, '♣'], [6, '♠']]);
$threeOfAKind = $makeCards([[9, '♠'], [9, '♥'], [9, '♦']]);
$straightFlush = $makeCards([[10, '♠'], [11, '♠'], [12, '♠'], [13, '♠'], [14, '♠']]);
check(zingplayEvaluate($wheel)['label'] === 'Sảnh 5', 'A-2-3-4-5 should be a straight.');
check(zingplayCompareHands($wheel, $sixHigh) < 0, 'A low straight should lose to a six-high straight.');
check(zingplayEvaluate($threeOfAKind)['label'] === 'Sám cô 9', 'Three-card trips should be ranked.');
check(zingplayEvaluate($straightFlush)['label'] === 'Thùng phá sảnh A', 'Five-card straight flush should be ranked.');

$hand = [
    ['id' => 'front-a', 'value' => 2, 'suit' => '♠'],
    ['id' => 'front-b', 'value' => 3, 'suit' => '♥'],
    ['id' => 'front-c', 'value' => 7, 'suit' => '♦'],
    ['id' => 'middle-a', 'value' => 4, 'suit' => '♠'],
    ['id' => 'middle-b', 'value' => 5, 'suit' => '♥'],
    ['id' => 'middle-c', 'value' => 6, 'suit' => '♦'],
    ['id' => 'middle-d', 'value' => 8, 'suit' => '♣'],
    ['id' => 'middle-e', 'value' => 9, 'suit' => '♠'],
    ['id' => 'back-a', 'value' => 10, 'suit' => '♣'],
    ['id' => 'back-b', 'value' => 10, 'suit' => '♦'],
    ['id' => 'back-c', 'value' => 10, 'suit' => '♥'],
    ['id' => 'back-d', 'value' => 11, 'suit' => '♣'],
    ['id' => 'back-e', 'value' => 11, 'suit' => '♦'],
];
$arrangement = [
    'front' => ['front-a', 'front-b', 'front-c'],
    'middle' => ['middle-a', 'middle-b', 'middle-c', 'middle-d', 'middle-e'],
    'back' => ['back-a', 'back-b', 'back-c', 'back-d', 'back-e'],
];
check(zingplayValidateArrangement($hand, $arrangement)['valid'], 'A valid arrangement should be accepted.');
$duplicate = $arrangement;
$duplicate['front'][0] = 'back-a';
check(!zingplayValidateArrangement($hand, $duplicate)['valid'], 'Duplicate or missing cards should be rejected.');
$foul = [
    'front' => ['back-a', 'back-b', 'back-c'],
    'middle' => $arrangement['middle'],
    'back' => ['front-a', 'front-b', 'front-c', 'back-d', 'back-e'],
];
check(!zingplayValidateArrangement($hand, $foul)['valid'], 'A foul hand should be rejected.');
$malformed = $arrangement;
$malformed['front'][0] = ['unexpected' => 'value'];
check(!zingplayValidateArrangement($hand, $malformed)['valid'], 'Non-string card ids should be rejected.');

$winnerHands = [
    'front' => $makeCards([[8, '♠'], [8, '♥'], [8, '♦']]),
    'middle' => $makeCards([[10, '♠'], [10, '♥'], [4, '♦'], [6, '♣'], [7, '♠']]),
    'back' => $makeCards([[2, '♠'], [2, '♥'], [5, '♦'], [7, '♣'], [9, '♠']]),
];
$otherHands = [
    'front' => $makeCards([[14, '♠'], [14, '♥'], [13, '♦']]),
    'middle' => $makeCards([[9, '♠'], [8, '♥'], [6, '♦'], [4, '♣'], [2, '♠']]),
    'back' => $makeCards([[14, '♠'], [13, '♥'], [12, '♦'], [10, '♣'], [8, '♠']]),
];
$results = zingplayCompareResults([
    ['id' => 'winner', 'name' => 'Winner', 'hands' => $winnerHands],
    ['id' => 'other', 'name' => 'Other', 'hands' => $otherHands],
]);
check($results[0]['points'] === 10 && $results[1]['points'] === -10, 'Sweep doubles chi values, including the front three-of-a-kind bonus.');
check($results[0]['chi']['front']['points'] === 3 && $results[0]['bonus'] === 5, 'Chi points and sweep bonus should be reported separately.');
check(isset($results[0]['hands']['front']), 'Results should expose the arranged hands.');

$plainWinner = [
    'front' => $makeCards([[9, '♠'], [7, '♥'], [4, '♦']]),
    'middle' => $makeCards([[10, '♠'], [10, '♥'], [4, '♦'], [6, '♣'], [7, '♠']]),
    'back' => $makeCards([[5, '♠'], [5, '♥'], [5, '♦'], [5, '♣'], [9, '♠']]),
];
$plainLoser = [
    'front' => $makeCards([[8, '♠'], [6, '♥'], [3, '♦']]),
    'middle' => $makeCards([[11, '♠'], [11, '♥'], [6, '♦'], [4, '♣'], [2, '♠']]),
    'back' => $makeCards([[14, '♠'], [14, '♥'], [14, '♦'], [10, '♣'], [8, '♠']]),
];
$mixed = zingplayCompareResults([
    ['id' => 'a', 'name' => 'A', 'white' => null, 'hands' => $plainWinner],
    ['id' => 'b', 'name' => 'B', 'white' => null, 'hands' => $plainLoser],
]);
check($mixed[0]['chi']['back']['points'] === 4, 'Winning the back chi with quads is worth four chi.');
check($mixed[0]['points'] === 4 && $mixed[1]['points'] === -4, 'A split result without a sweep scores each chi once.');

$quadsBack = $makeCards([[5, '♠'], [5, '♥'], [5, '♦'], [5, '♣'], [9, '♠']]);
check(zingplayChiValue('back', zingplayEvaluate($quadsBack)) === 4, 'Back quads are worth four chi.');
check(zingplayChiValue('middle', zingplayEvaluate($quadsBack)) === 8, 'Middle quads are worth eight chi.');
check(zingplayChiValue('middle', zingplayEvaluate($straightFlush)) === 10, 'Middle straight flush is worth ten chi.');

$sapLangHands = static fn(int $base): array => [
    'front' => $makeCards([[$base, '♠'], [$base + 1, '♥'], [2, '♦']]),
    'middle' => $makeCards([[$base, '♠'], [$base, '♥'], [4, '♦'], [6, '♣'], [7, '♠']]),
    'back' => $makeCards([[$base, '♠'], [$base, '♥'], [$base, '♦'], [10, '♣'], [10, '♠']]),
];
$sapLang = zingplayCompareResults([
    ['id' => 'a', 'name' => 'A', 'hands' => $sapLangHands(13)],
    ['id' => 'b', 'name' => 'B', 'hands' => $sapLangHands(9)],
    ['id' => 'c', 'name' => 'C', 'hands' => $sapLangHands(5)],
]);
check($sapLang[0]['sapLang'] === true, 'Sweeping every opponent should be sap lang.');
check(array_column($sapLang, 'points') === [24, -6, -18], 'Sap lang doubles the sweep result against every opponent.');
check(array_sum(array_column($sapLang, 'points')) === 0, 'Scores should always sum to zero.');

check(zingplaySettleChips(['a' => 100, 'b' => -60, 'c' => -40], ['a' => 0, 'b' => 500, 'c' => 500])
    === ['b' => -60, 'c' => -40, 'a' => 100], 'Settlement should pass through when balances cover losses.');
$short = zingplaySettleChips(['a' => 60, 'b' => 40, 'c' => -100], ['a' => 0, 'b' => 0, 'c' => 30]);
check($short['c'] === -30 && $short['a'] + $short['b'] === 30, 'Short balances should only pay what they have.');
check(zingplayMinBalance(50) === 1000, 'Minimum balance is twenty stakes.');

// ---------------------------------------------------------------------------
// ZingPlay v2: nhãn, seed, tới trắng, tự xếp bài.
// ---------------------------------------------------------------------------

$suitCodes = ['c' => 'clubs', 'd' => 'diamonds', 'h' => 'hearts', 's' => 'spades'];
$rankValues = ['J' => 11, 'Q' => 12, 'K' => 13, 'A' => 14];
// Ví dụ: H('Ah Kd 10s 2c') — lá theo định dạng dây thật {id,suit,value,label}.
$H = static function (string $spec) use ($suitCodes, $rankValues): array {
    $cards = [];
    foreach (preg_split('/\s+/', trim($spec)) as $token) {
        $suit = $suitCodes[substr($token, -1)];
        $rank = substr($token, 0, -1);
        $value = $rankValues[$rank] ?? (int)$rank;
        $cards[] = [
            'id' => $suit . '-' . $value,
            'suit' => ZINGPLAY_SUITS[$suit],
            'value' => $value,
            'label' => zingplayRankLabel($value),
        ];
    }
    return $cards;
};
// Cùng id lặp lại trong test tới trắng vẫn cần id riêng: gắn hậu tố khi trùng.
$H13 = static function (string $spec) use ($H): array {
    $cards = $H($spec);
    $seen = [];
    foreach ($cards as &$card) {
        $seen[$card['id']] = ($seen[$card['id']] ?? 0) + 1;
        if ($seen[$card['id']] > 1) {
            $card['id'] .= '#' . $seen[$card['id']];
        }
    }
    unset($card);
    return $cards;
};

// --- Nhãn ---
$labelOf = static fn(string $spec): string => zingplayEvaluate($H($spec))['label'];
check($labelOf('2c 5d 9h') === 'Mậu thầu 9', 'Label: Mậu thầu 3 lá.');
check($labelOf('2c 5d 9h Jc 4s') === 'Mậu thầu J', 'Label: Mậu thầu 5 lá.');
check($labelOf('2c 2d 9h') === 'Đôi 2', 'Label: Đôi 3 lá.');
check($labelOf('Kc Kd 9h 3c 4s') === 'Đôi K', 'Label: Đôi 5 lá.');
check($labelOf('Kc Kd 9h 9c 4s') === 'Hai đôi K và 9', 'Label: Hai đôi.');
check($labelOf('7c 7d 7h') === 'Sám cô 7', 'Label: Sám cô 3 lá.');
check($labelOf('7c 7d 7h Ac 4s') === 'Sám cô 7', 'Label: Sám cô 5 lá.');
check($labelOf('3c 4d 5h 6c 7s') === 'Sảnh 7', 'Label: Sảnh.');
check($labelOf('Ac 2d 3h 4c 5s') === 'Sảnh 5', 'Label: Sảnh A-5 là Sảnh 5.');
check($labelOf('10c Jd Qh Kc As') === 'Sảnh A', 'Label: Sảnh 10-A là Sảnh A.');
check($labelOf('2h 5h 9h Jh Ah') === 'Thùng A', 'Label: Thùng.');
check($labelOf('2h 5h 9h 10h Kh') === 'Thùng K', 'Label: Thùng K.');
check($labelOf('4c 4d 4h 9c 9s') === 'Cù lũ 4', 'Label: Cù lũ theo bộ ba.');
check($labelOf('Qc Qd Qh Qs 9s') === 'Tứ quý Q', 'Label: Tứ quý.');
check($labelOf('Ah 2h 3h 4h 5h') === 'Thùng phá sảnh 5', 'Label: Thùng phá sảnh A-5.');
check($labelOf('10s Js Qs Ks As') === 'Thùng phá sảnh A', 'Label: Thùng phá sảnh A.');
check(zingplayEvaluate($H('Ac 2d 3h 4c 5s'))['category'] === 4
    && zingplayEvaluate($H('Ac 2d 3h 4c 5s'))['tieBreakers'] === [5], 'Wheel keeps category 4 and tie-breaker 5.');
check(zingplayEvaluate($H('2c 5d 9h'))['category'] === 0, 'Categories are unchanged.');

// --- Seed / xáo bài ---
$seedA = '00112233445566778899aabbccddeeff';
$seedB = 'ffeeddccbbaa99887766554433221100';
$deckA = zingplayShuffleWithSeed($seedA);
check(count($deckA) === 52 && count(array_unique(array_column($deckA, 'id'))) === 52, '52 distinct cards.');
check($deckA === zingplayCreateDeck($seedA), 'createDeck(seed) = shuffleWithSeed(seed).');
check($deckA === zingplayShuffleWithSeed($seedA), 'Same seed is deterministic.');
check($deckA !== zingplayShuffleWithSeed($seedB), 'Different seeds differ.');
check(array_slice(array_column($deckA, 'id'), 0, 8)
    === ['hearts-7', 'clubs-8', 'spades-3', 'spades-2', 'diamonds-4', 'spades-10', 'spades-4', 'clubs-12'],
    'Shuffle algorithm is pinned (sha256 seed:counter, modulo).');
check($deckA[0] === ['id' => 'hearts-7', 'suit' => '♥', 'value' => 7, 'label' => '7'], 'Card wire format is unchanged.');
check(preg_match('/^[0-9a-f]{32}$/', zingplayNewSeed()) === 1, 'New seeds are 32 hex chars.');
check(zingplayNewSeed() !== zingplayNewSeed(), 'New seeds are random.');
check(count(array_unique(array_column(zingplayCreateDeck(), 'id'))) === 52, 'Random deck has 52 distinct cards.');
$threw = false;
try {
    zingplayShuffleWithSeed('xyz');
} catch (InvalidArgumentException) {
    $threw = true;
}
check($threw, 'Invalid seeds are rejected.');
// Kiểm chứng độc lập thuật toán: tính lại bằng hash_hmac-free vòng lặp riêng.
$reference = zingplayBaseDeck();
$counter = 0;
for ($i = 51; $i >= 1; $i--) {
    $digest = hash('sha256', $seedA . ':' . $counter++);
    $r = hexdec(substr($digest, 0, 8));
    $j = $r % ($i + 1);
    $tmp = $reference[$i];
    $reference[$i] = $reference[$j];
    $reference[$j] = $tmp;
}
check($reference === $deckA, 'Shuffle matches the documented reference implementation.');
$baseIds = array_column(zingplayBaseDeck(), 'id');
check($baseIds[0] === 'clubs-2' && $baseIds[12] === 'clubs-14' && $baseIds[13] === 'diamonds-2'
    && $baseIds[51] === 'spades-14', 'Base deck order is clubs, diamonds, hearts, spades; 2..A.');

// --- Tới trắng: từng loại ---
$whiteCases = [
    'rong_cuon' => ['Ah 2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh'],
    'sanh_rong' => ['2c 3d 4h 5s 6c 7d 8h 9s 10c Jd Qh Ks Ac'],
    'cung_mau_13' => ['2h 3h 4h 5h 6h 7h 8h 2d 3d 4d 5d 6d 7d'],
    'cung_mau_12' => ['2h 3h 4h 5h 6h 7h 8h 2d 3d 4d 5d 6d 7s'],
    'sau_doi' => ['6c 6d 7c 7h 8d 8s 9c 9h 10d 10s Jc Jh Kc'],
    'ba_sanh' => [
        '3c 4d 5h 6c 7d 8h 9s 10c 6d 7h 8s 9c 10d',
        'Ac 2d 3h Ad 2c 3s 4h 5d 10c Js Qh Kd Ah',
        'Qc Kd As 2c 3d 4h 5s 6c 2h 3s 4d 5c 6h',
    ],
    'ba_thung' => [
        '2s 5s 9s Ks Qs 3h 7h 8h Ah Jh 4d 9d Jd',
        '2s 3s 5s 6s 8s 9s Js Qs Ks As 2h 3h 4h',
        '2s 5s 9s Ks Qs 3s 7s 8s 4h 9h Jh Ah Kh',
    ],
];
foreach ($whiteCases as $key => $specs) {
    foreach ($specs as $spec) {
        check(zingplayDetectWhite($H13($spec)) === $key, "Detect $key: $spec => " . var_export(zingplayDetectWhite($H13($spec)), true));
    }
}
$whiteNull = [
    '11 đỏ 2 đen' => '2h 3h 4h 5h 6h 7h 8h 2d 3d 4d 5d 2c 3s',
    'K-A-2 không phải sảnh' => 'Kc Ad 2s 3c 4d 5h 6s 7c 3d 4h 5s 6c 7d',
    '5 đôi' => '6c 6d 7c 7h 8d 8s 9c 9h 10d 10s Jc Kh Ac',
    'ba thùng sai hình dạng 9-4' => '2s 5s 9s Ks Qs 3s 7s 8s Js 4h 9h Jh Ah',
    'ba thùng 7-6' => '2s 5s 9s Ks Qs 3s 7s 2h 4h 9h Jh Ah Kh',
    'ba thùng 4-4-5' => '2s 5s 9s Ks 3h 7h 8h Qh 4d 9d Jd 2c 6c',
];
foreach ($whiteNull as $name => $spec) {
    check(zingplayDetectWhite($H13($spec)) === null, "Not white: $name (got " . var_export(zingplayDetectWhite($H13($spec)), true) . ')');
}
check(zingplayDetectWhite($H13('4c 4d 4h 4s 2c 2d 3c 3d 5c 5d 6c 6d Kh')) === 'sau_doi', 'Quads count as two pairs.');
check(zingplayDetectWhite($H13('5c 5d 5h 6c 6d 7c 7h 8d 8s 9c 9h 10c 10d')) === 'sau_doi', 'Five pairs plus trips is six pairs.');
check(zingplayDetectWhite($H13('Ac 2d 3h Ad 2c 3s 4h 5d 10c Js Qh Kd Ah')) === 'ba_sanh', 'A-2-3 and A-5 / 10-A straights are valid.');
check(zingplayDetectWhite(array_slice($H13('Ah 2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh'), 0, 12)) === null, 'Needs 13 cards.');
// Thứ hạng ưu tiên: rồng cuốn cũng là sảnh rồng + cùng màu → rồng cuốn.
check(ZINGPLAY_WHITE_TYPES['rong_cuon']['rank'] > ZINGPLAY_WHITE_TYPES['sanh_rong']['rank'], 'White ranks descend.');
check(zingplayDetectWhite($H13('2h 3h 4h 5h 6h 7h 8h 9d 10d Jd Qd Kd Ad')) === 'sanh_rong', 'Distinct red ranks beat 13-same-colour.');
// Tới trắng ngẫu nhiên: chỉ cần không lỗi và nhất quán với bảng.
for ($i = 0; $i < 300; $i++) {
    $type = zingplayDetectWhite(array_slice(zingplayCreateDeck(), 0, 13));
    check($type === null || isset(ZINGPLAY_WHITE_TYPES[$type]), 'Detected white is a known type.');
}

// --- Chấm điểm có tới trắng ---
$asHands = static function (array $cards): array {
    $byId = array_column($cards, null, 'id');
    $arrangement = zingplayAutoArrange($cards);
    return array_map(static fn(array $ids): array => array_map(static fn(string $id): array => $byId[$id], $ids), $arrangement);
};
$normalHand = $H('2c 2d 9h 3c 5d 8h Jc Ks 4s 6d 10h Qc Ah'); // không tới trắng
check(zingplayDetectWhite($normalHand) === null, 'Fixture hand is not white.');
$dragon = $H13('Ah 2h 3h 4h 5h 6h 7h 8h 9h 10h Jh Qh Kh');
$sixPairs = $H13('6c 6d 7c 7h 8d 8s 9c 9h 10d 10s Jc Jh Kc');
$straightDragon = $H13('2c 3d 4h 5s 6c 7d 8h 9s 10c Jd Qh Ks Ac');
$whiteVsNormal = zingplayCompareResults([
    ['id' => 'w', 'name' => 'W', 'hands' => $asHands($dragon)],
    ['id' => 'n', 'name' => 'N', 'hands' => $asHands($normalHand)],
]);
check($whiteVsNormal[0]['white'] === 'rong_cuon' && $whiteVsNormal[0]['whiteLabel'] === 'Rồng cuốn', 'White player reports key and label.');
check($whiteVsNormal[1]['white'] === null && $whiteVsNormal[1]['whiteLabel'] === null, 'Normal player has no white.');
check($whiteVsNormal[0]['points'] === 36 && $whiteVsNormal[1]['points'] === -36, 'Dragon beats one opponent for 36.');
check($whiteVsNormal[0]['whitePoints'] === 36 && $whiteVsNormal[0]['bonus'] === 0 && !$whiteVsNormal[0]['sapLang'], 'White pair has no bonus or sap lang.');
check($whiteVsNormal[0]['pairs'][0]['white'] === true && $whiteVsNormal[0]['pairs'][0]['multiplier'] === 1
    && $whiteVsNormal[0]['pairs'][0]['total'] === 36 && $whiteVsNormal[0]['pairs'][0]['sapHam'] === false
    && $whiteVsNormal[0]['pairs'][0]['opponentId'] === 'n', 'White pair detail.');
check($whiteVsNormal[1]['pairs'][0]['total'] === -36 && $whiteVsNormal[1]['pairs'][0]['sum'] === -36, 'Loser pair detail is mirrored.');
foreach (ZINGPLAY_PILES as $pile) {
    check($whiteVsNormal[0]['chi'][$pile]['outcome'] === 'win' && $whiteVsNormal[0]['chi'][$pile]['label'] === 'Tới trắng',
        'White winner chi convention.');
    check($whiteVsNormal[1]['chi'][$pile]['outcome'] === 'loss' && $whiteVsNormal[1]['chi'][$pile]['label'] === 'Thua tới trắng',
        'Loser to white chi convention when every pair is white.');
}
check($whiteVsNormal[0]['chi']['front']['hand'] !== '', 'White player still reports arranged hand labels.');

$whiteVsWhite = zingplayCompareResults([
    ['id' => 'a', 'name' => 'A', 'hands' => $asHands($sixPairs)],
    ['id' => 'b', 'name' => 'B', 'hands' => $asHands($straightDragon)],
]);
check($whiteVsWhite[0]['points'] === -24 && $whiteVsWhite[1]['points'] === 24, 'Higher white wins its own points (sanh rong 24).');
check($whiteVsWhite[0]['chi']['back']['label'] === 'Thua tới trắng' && $whiteVsWhite[1]['chi']['back']['label'] === 'Tới trắng',
    'White vs white chi labels.');
$sixPairsTwo = $H13('5c 5d 6h 6s 7c 7h 8d 8s 9c 9h Jd Js Ac');
$tie = zingplayCompareResults([
    ['id' => 'a', 'name' => 'A', 'hands' => $asHands($sixPairs)],
    ['id' => 'b', 'name' => 'B', 'hands' => $asHands($sixPairsTwo)],
]);
check($tie[0]['points'] === 0 && $tie[1]['points'] === 0 && $tie[0]['chi']['front']['outcome'] === 'tie'
    && $tie[0]['chi']['front']['label'] === 'Hòa tới trắng', 'Equal white ranks tie for zero.');

$threeWay = zingplayCompareResults([
    ['id' => 'w', 'name' => 'W', 'hands' => $asHands($straightDragon)],
    ['id' => 'x', 'name' => 'X', 'hands' => $asHands($normalHand)],
    ['id' => 'y', 'name' => 'Y', 'hands' => $asHands($H('3d 8c 9d 4c 6h 10s Jh Kd 5s 7h Qs 2h 2c'))],
]);
check(array_sum(array_column($threeWay, 'points')) === 0, 'Three-way white scoring is zero-sum.');
check($threeWay[0]['points'] === 48 && !$threeWay[0]['sapLang'], 'White winner gets 24 from each opponent and never sap lang.');
check(count($threeWay[0]['pairs']) === 2 && count($threeWay[1]['pairs']) === 2, 'Each player has one pair entry per opponent.');
$xy = array_values(array_filter($threeWay[1]['pairs'], static fn(array $pair): bool => $pair['opponentId'] === 'y'))[0];
check($xy['white'] === false, 'Non-white pair stays a normal comparison.');
check($threeWay[1]['points'] + $threeWay[2]['points'] === -48, 'Opponents together pay what the white winner receives.');
check($threeWay[1]['chi']['front']['label'] !== 'Thua tới trắng' || $threeWay[1]['pairs'][1]['white'], 'Mixed pairs keep normal chi labels.');

// Chỉ dùng tắt/bật khi người gọi ép white=null.
$forcedOff = zingplayCompareResults([
    ['id' => 'w', 'name' => 'W', 'white' => null, 'hands' => $asHands($dragon)],
    ['id' => 'n', 'name' => 'N', 'white' => null, 'hands' => $asHands($normalHand)],
]);
check($forcedOff[0]['white'] === null && $forcedOff[0]['whitePoints'] === 0, 'Explicit white=null disables detection.');
check(array_sum(array_column($forcedOff, 'points')) === 0, 'Forced-off scoring is zero-sum.');

// Zero-sum và đối xứng trên nhiều ván ngẫu nhiên (có cả tới trắng cưỡng bức).
mt_srand(20260101);
for ($game = 0; $game < 400; $game++) {
    $players = [];
    $size = 2 + $game % 3;
    $deck = zingplayCreateDeck(bin2hex(random_bytes(16)));
    for ($index = 0; $index < $size; $index++) {
        $cards = array_slice($deck, $index * 13, 13);
        $players[] = ['id' => 'p' . $index, 'name' => 'P' . $index, 'hands' => $asHands($cards)];
    }
    if ($game % 5 === 0) {
        $players[0]['hands'] = $asHands($dragon);
    }
    if ($game % 7 === 0 && $size > 2) {
        $players[1]['hands'] = $asHands($sixPairs);
    }
    $results = zingplayCompareResults($players);
    check(array_sum(array_column($results, 'points')) === 0, 'Zero-sum game ' . $game);
    foreach ($results as $result) {
        $chiPoints = array_sum(array_column($result['chi'], 'points'));
        check($result['points'] === $chiPoints + $result['bonus'] + $result['whitePoints'], 'points = chi + bonus + white, game ' . $game);
        check(array_sum(array_column($result['pairs'], 'total')) === $result['points'], 'Pair totals add up, game ' . $game);
        check(count($result['pairs']) === $size - 1, 'One pair per opponent.');
    }
}

// --- Tự xếp bài ---
$timings = [];
$distinct = [];
for ($game = 0; $game < 2000; $game++) {
    $cards = array_slice(zingplayCreateDeck(bin2hex(random_bytes(16))), 0, 13);
    $start = hrtime(true);
    $arrangement = zingplayAutoArrange($cards);
    $timings[] = (hrtime(true) - $start) / 1e6;
    $validation = zingplayValidateArrangement($cards, $arrangement);
    check($validation['valid'], 'Auto arrangement must never be foul (game ' . $game . '): ' . ($validation['message'] ?? ''));
    if ($game < 3) {
        check($arrangement === zingplayAutoArrange(array_reverse($cards)), 'Auto arrange does not depend on input order.');
    }
}
$averageMs = array_sum($timings) / count($timings);
check($averageMs < 150, sprintf('Auto arrange average %.1fms must stay below 150ms.', $averageMs));
check(max($timings) < 400, sprintf('Auto arrange worst case %.1fms is too slow.', max($timings)));
fwrite(STDOUT, sprintf("autoArrange: 2000 ván, trung bình %.1fms, chậm nhất %.1fms\n", $averageMs, max($timings)));
$pairsHand = $H('Ac Ad 7h 7s 2c 2d 2h Kc Qd Js 9c 5d 3h');
$arranged = zingplayAutoArrange($pairsHand);
check(zingplayValidateArrangement($pairsHand, $arranged)['valid'], 'Hand with trips and pairs arranges validly.');
check(zingplayAutoArrange($pairsHand) === $arranged, 'Auto arrange is deterministic.');
$dragonArranged = zingplayAutoArrange($dragon);
check(zingplayValidateArrangement($dragon, $dragonArranged)['valid'], 'Dragon arranges validly.');

echo "PHP game rules tests passed.\n";

<?php
declare(strict_types=1);

const ZINGPLAY_SUITS = [
    'clubs' => '♣',
    'diamonds' => '♦',
    'hearts' => '♥',
    'spades' => '♠',
];
const ZINGPLAY_PILES = ['front', 'middle', 'back'];
const ZINGPLAY_PILE_SIZES = ['front' => 3, 'middle' => 5, 'back' => 5];
const ZINGPLAY_STAKES = [50, 100, 200, 500, 1000];
const ZINGPLAY_MIN_BALANCE_MULTIPLIER = 20;

const ZINGPLAY_WHITE_ENABLED = true;
// rank cao hơn thắng; points = điểm thắng mỗi đối thủ.
const ZINGPLAY_WHITE_TYPES = [
    'rong_cuon' => ['rank' => 7, 'points' => 36, 'label' => 'Rồng cuốn'],
    'sanh_rong' => ['rank' => 6, 'points' => 24, 'label' => 'Sảnh rồng'],
    'cung_mau_13' => ['rank' => 5, 'points' => 20, 'label' => '13 lá cùng màu'],
    'cung_mau_12' => ['rank' => 4, 'points' => 16, 'label' => '12 lá cùng màu'],
    'sau_doi' => ['rank' => 3, 'points' => 12, 'label' => 'Sáu đôi'],
    'ba_sanh' => ['rank' => 2, 'points' => 10, 'label' => 'Ba sảnh'],
    'ba_thung' => ['rank' => 1, 'points' => 8, 'label' => 'Ba thùng'],
];

function zingplayRankLabel(int $value): string
{
    return [11 => 'J', 12 => 'Q', 13 => 'K', 14 => 'A'][$value] ?? (string)$value;
}

function zingplayBaseDeck(): array
{
    $deck = [];
    foreach (ZINGPLAY_SUITS as $code => $symbol) {
        for ($value = 2; $value <= 14; $value++) {
            $deck[] = [
                'id' => $code . '-' . $value,
                'suit' => $symbol,
                'value' => $value,
                'label' => zingplayRankLabel($value),
            ];
        }
    }
    return $deck;
}

function zingplayNewSeed(): string
{
    return bin2hex(random_bytes(16));
}

// Fisher–Yates với RNG xác định: rand = u32 big-endian của 4 byte đầu sha256(seed ':' counter).
function zingplayShuffleWithSeed(string $seed): array
{
    if (preg_match('/^[0-9a-f]{32}$/', $seed) !== 1) {
        throw new InvalidArgumentException('Seed phải gồm 32 ký tự hex thường.');
    }
    $deck = zingplayBaseDeck();
    $counter = 0;
    for ($index = 51; $index > 0; $index--) {
        $random = unpack('N', substr(hash('sha256', $seed . ':' . $counter++, true), 0, 4))[1];
        $swapIndex = $random % ($index + 1);
        [$deck[$index], $deck[$swapIndex]] = [$deck[$swapIndex], $deck[$index]];
    }
    return $deck;
}

function zingplayCreateDeck(?string $seed = null): array
{
    return zingplayShuffleWithSeed($seed ?? zingplayNewSeed());
}

function zingplayEvaluate(array $cards): array
{
    if (!in_array(count($cards), [3, 5], true)) {
        throw new InvalidArgumentException('Mỗi chi phải có 3 hoặc 5 lá.');
    }

    $values = array_map(static fn(array $card): int => (int)$card['value'], $cards);
    rsort($values, SORT_NUMERIC);
    $counts = array_count_values($values);
    $groups = [];
    foreach ($counts as $value => $count) {
        $groups[] = [(int)$value, (int)$count];
    }
    usort($groups, static fn(array $left, array $right): int =>
        ($right[1] <=> $left[1]) ?: ($right[0] <=> $left[0])
    );
    $isFlush = count(array_unique(array_column($cards, 'suit'))) === 1;
    $ascending = array_values(array_unique($values));
    sort($ascending, SORT_NUMERIC);
    $wheel = count($cards) === 5
        ? $ascending === [2, 3, 4, 5, 14]
        : $ascending === [2, 3, 14];
    $isStraight = count($ascending) === count($cards)
        && ($wheel || end($ascending) - $ascending[0] === count($cards) - 1);
    $straightHigh = $wheel ? 5 : (int)end($ascending);
    $labelRank = static fn(int $value): string => zingplayRankLabel($value);

    if (count($cards) === 3) {
        if ($groups[0][1] === 3) {
            return ['category' => 3, 'tieBreakers' => [$groups[0][0]], 'label' => 'Sám cô ' . $labelRank($groups[0][0])];
        }
        if ($groups[0][1] === 2) {
            return [
                'category' => 1,
                'tieBreakers' => [$groups[0][0], $groups[1][0]],
                'label' => 'Đôi ' . $labelRank($groups[0][0]),
            ];
        }
        return ['category' => 0, 'tieBreakers' => $values, 'label' => 'Mậu thầu ' . $labelRank($values[0])];
    }
    if ($isStraight && $isFlush) {
        return ['category' => 8, 'tieBreakers' => [$straightHigh], 'label' => 'Thùng phá sảnh ' . $labelRank($straightHigh)];
    }
    if ($groups[0][1] === 4) {
        return [
            'category' => 7,
            'tieBreakers' => [$groups[0][0], $groups[1][0]],
            'label' => 'Tứ quý ' . $labelRank($groups[0][0]),
        ];
    }
    if ($groups[0][1] === 3 && $groups[1][1] === 2) {
        return [
            'category' => 6,
            'tieBreakers' => [$groups[0][0], $groups[1][0]],
            'label' => 'Cù lũ ' . $labelRank($groups[0][0]),
        ];
    }
    if ($isFlush) {
        return ['category' => 5, 'tieBreakers' => $values, 'label' => 'Thùng ' . $labelRank($values[0])];
    }
    if ($isStraight) {
        return ['category' => 4, 'tieBreakers' => [$straightHigh], 'label' => 'Sảnh ' . $labelRank($straightHigh)];
    }
    if ($groups[0][1] === 3) {
        return [
            'category' => 3,
            'tieBreakers' => array_column($groups, 0),
            'label' => 'Sám cô ' . $labelRank($groups[0][0]),
        ];
    }
    if ($groups[0][1] === 2 && $groups[1][1] === 2) {
        return [
            'category' => 2,
            'tieBreakers' => [$groups[0][0], $groups[1][0], $groups[2][0]],
            'label' => 'Hai đôi ' . $labelRank($groups[0][0]) . ' và ' . $labelRank($groups[1][0]),
        ];
    }
    if ($groups[0][1] === 2) {
        return [
            'category' => 1,
            'tieBreakers' => array_merge([$groups[0][0]], array_column(array_slice($groups, 1), 0)),
            'label' => 'Đôi ' . $labelRank($groups[0][0]),
        ];
    }
    return ['category' => 0, 'tieBreakers' => $values, 'label' => 'Mậu thầu ' . $labelRank($values[0])];
}

function zingplayCompareHands(array $left, array $right): int
{
    $first = zingplayEvaluate($left);
    $second = zingplayEvaluate($right);
    if ($first['category'] !== $second['category']) {
        return $first['category'] <=> $second['category'];
    }
    $length = max(count($first['tieBreakers']), count($second['tieBreakers']));
    for ($index = 0; $index < $length; $index++) {
        $difference = ($first['tieBreakers'][$index] ?? 0) <=> ($second['tieBreakers'][$index] ?? 0);
        if ($difference !== 0) {
            return $difference;
        }
    }
    return 0;
}

function zingplayValidateArrangement(array $cards, mixed $arrangement): array
{
    if (!is_array($arrangement)) {
        return ['valid' => false, 'message' => 'Bài xếp không hợp lệ.'];
    }
    foreach (ZINGPLAY_PILES as $pile) {
        if (!isset($arrangement[$pile]) || !is_array($arrangement[$pile])
            || count($arrangement[$pile]) !== ZINGPLAY_PILE_SIZES[$pile]) {
            return ['valid' => false, 'message' => 'Mỗi chi cần đúng số lá quy định.'];
        }
    }
    $submitted = array_merge($arrangement['front'], $arrangement['middle'], $arrangement['back']);
    foreach ($submitted as $id) {
        if (!is_string($id)) {
            return ['valid' => false, 'message' => 'Bài xếp phải dùng đủ 13 lá riêng biệt trên tay.'];
        }
    }
    $handIds = array_column($cards, 'id');
    if (count($submitted) !== 13 || count(array_unique($submitted)) !== 13
        || array_diff($submitted, $handIds) !== [] || array_diff($handIds, $submitted) !== []) {
        return ['valid' => false, 'message' => 'Bài xếp phải dùng đủ 13 lá riêng biệt trên tay.'];
    }
    $byId = [];
    foreach ($cards as $card) {
        $byId[$card['id']] = $card;
    }
    $hands = [];
    foreach (ZINGPLAY_PILES as $pile) {
        $hands[$pile] = array_map(static fn(string $id): array => $byId[$id], $arrangement[$pile]);
    }
    if (zingplayCompareHands($hands['front'], $hands['middle']) > 0
        || zingplayCompareHands($hands['middle'], $hands['back']) > 0) {
        return [
            'valid' => false,
            'message' => 'Binh lủng: chi cuối phải mạnh hơn chi giữa, chi giữa mạnh hơn chi đầu.',
        ];
    }
    return ['valid' => true, 'hands' => $hands];
}

function zingplayChiValue(string $pile, array $evaluation): int
{
    $category = $evaluation['category'];
    return match ($pile) {
        'front' => $category === 3 ? 3 : 1,
        'middle' => match ($category) {
            6 => 2,
            7 => 8,
            8 => 10,
            default => 1,
        },
        default => match ($category) {
            7 => 4,
            8 => 5,
            default => 1,
        },
    };
}

function zingplayHandsCards(array $hands): array
{
    $cards = [];
    foreach (ZINGPLAY_PILES as $pile) {
        foreach ($hands[$pile] ?? [] as $card) {
            $cards[] = $card;
        }
    }
    return $cards;
}

// Một sảnh `$length` lá bắt đầu từ `$start` (1 = A thấp). Không cho phép vòng K-A-2.
function zingplayStraightRanks(int $start, int $length): array
{
    $ranks = [];
    for ($offset = 0; $offset < $length; $offset++) {
        $rank = $start + $offset;
        $ranks[] = $rank === 1 ? 14 : $rank;
    }
    return $ranks;
}

function zingplayCanSplitThreeStraights(array $rankCounts): bool
{
    $threes = [];
    for ($start = 1; $start <= 12; $start++) {
        $threes[] = zingplayStraightRanks($start, 3);
    }
    $fives = [];
    for ($start = 1; $start <= 10; $start++) {
        $fives[] = zingplayStraightRanks($start, 5);
    }
    $take = static function (array &$counts, array $ranks): bool {
        foreach ($ranks as $index => $rank) {
            if ($counts[$rank] === 0) {
                foreach (array_slice($ranks, 0, $index) as $restored) {
                    $counts[$restored]++;
                }
                return false;
            }
            $counts[$rank]--;
        }
        return true;
    };
    $give = static function (array &$counts, array $ranks): void {
        foreach ($ranks as $rank) {
            $counts[$rank]++;
        }
    };
    foreach ($threes as $three) {
        $counts = $rankCounts;
        if (!$take($counts, $three)) {
            continue;
        }
        // 13 lá = 3 + 5 + 5: nếu hai sảnh 5 lá lấy được thì không còn lá dư.
        foreach ($fives as $firstIndex => $first) {
            if (!$take($counts, $first)) {
                continue;
            }
            for ($secondIndex = $firstIndex; $secondIndex < count($fives); $secondIndex++) {
                if ($take($counts, $fives[$secondIndex])) {
                    return true;
                }
            }
            $give($counts, $first);
        }
    }
    return false;
}

// Trả về key tới trắng có rank cao nhất mà 13 lá thỏa, hoặc null.
function zingplayDetectWhite(array $cards13): ?string
{
    if (!ZINGPLAY_WHITE_ENABLED || count($cards13) !== 13) {
        return null;
    }
    $rankCounts = array_fill(2, 13, 0);
    $suitCounts = [];
    foreach ($cards13 as $card) {
        $rankCounts[(int)$card['value']]++;
        $suitCounts[$card['suit']] = ($suitCounts[$card['suit']] ?? 0) + 1;
    }
    $reds = ($suitCounts['♦'] ?? 0) + ($suitCounts['♥'] ?? 0);
    $pairs = 0;
    foreach ($rankCounts as $count) {
        $pairs += intdiv($count, 2);
    }
    $suitShape = array_values($suitCounts);
    rsort($suitShape, SORT_NUMERIC);

    if (count($suitCounts) === 1) {
        return 'rong_cuon';
    }
    if (count(array_filter($rankCounts)) === 13) {
        return 'sanh_rong';
    }
    if ($reds === 13 || $reds === 0) {
        return 'cung_mau_13';
    }
    if ($reds === 12 || $reds === 1) {
        return 'cung_mau_12';
    }
    if ($pairs >= 6) {
        return 'sau_doi';
    }
    if (zingplayCanSplitThreeStraights($rankCounts)) {
        return 'ba_sanh';
    }
    if (in_array($suitShape, [[13], [8, 5], [10, 3], [5, 5, 3]], true)) {
        return 'ba_thung';
    }
    return null;
}

function zingplayCompareResults(array $players): array
{
    $count = count($players);
    $totals = [];
    $evaluations = [];
    $whites = [];
    foreach ($players as $player) {
        $whiteKey = array_key_exists('white', $player)
            ? $player['white']
            : zingplayDetectWhite(zingplayHandsCards($player['hands']));
        if (!ZINGPLAY_WHITE_ENABLED || !isset(ZINGPLAY_WHITE_TYPES[$whiteKey ?? ''])) {
            $whiteKey = null;
        }
        $whites[$player['id']] = $whiteKey;
        $chi = [];
        foreach (ZINGPLAY_PILES as $pile) {
            $evaluations[$player['id']][$pile] = zingplayEvaluate($player['hands'][$pile]);
            $chi[$pile] = [
                'wins' => 0,
                'ties' => 0,
                'losses' => 0,
                'points' => 0,
                'hand' => $evaluations[$player['id']][$pile]['label'],
            ];
        }
        $totals[$player['id']] = [
            'id' => $player['id'],
            'name' => $player['name'],
            'points' => 0,
            'bonus' => 0,
            'sapLang' => false,
            'white' => $whiteKey,
            'whiteLabel' => $whiteKey === null ? null : ZINGPLAY_WHITE_TYPES[$whiteKey]['label'],
            'whitePoints' => 0,
            'hands' => $player['hands'],
            'chi' => $chi,
            'pairs' => [],
        ];
    }

    $pairs = [];
    for ($left = 0; $left < $count; $left++) {
        for ($right = $left + 1; $right < $count; $right++) {
            $leftId = $players[$left]['id'];
            $rightId = $players[$right]['id'];
            $pair = ['left' => $leftId, 'right' => $rightId, 'chi' => [], 'sum' => 0,
                'multiplier' => 1, 'leftWins' => 0, 'rightWins' => 0, 'white' => false];
            if ($whites[$leftId] !== null || $whites[$rightId] !== null) {
                $leftRank = $whites[$leftId] === null ? 0 : ZINGPLAY_WHITE_TYPES[$whites[$leftId]]['rank'];
                $rightRank = $whites[$rightId] === null ? 0 : ZINGPLAY_WHITE_TYPES[$whites[$rightId]]['rank'];
                $pair['white'] = true;
                $pair['chi'] = ['front' => 0, 'middle' => 0, 'back' => 0];
                if ($leftRank > $rightRank) {
                    $pair['sum'] = ZINGPLAY_WHITE_TYPES[$whites[$leftId]]['points'];
                } elseif ($rightRank > $leftRank) {
                    $pair['sum'] = -ZINGPLAY_WHITE_TYPES[$whites[$rightId]]['points'];
                }
                $pairs[] = $pair;
                continue;
            }
            foreach (ZINGPLAY_PILES as $pile) {
                $comparison = zingplayCompareHands($players[$left]['hands'][$pile], $players[$right]['hands'][$pile]);
                $value = 0;
                if ($comparison > 0) {
                    $value = zingplayChiValue($pile, $evaluations[$leftId][$pile]);
                    $pair['leftWins']++;
                    $totals[$leftId]['chi'][$pile]['wins']++;
                    $totals[$rightId]['chi'][$pile]['losses']++;
                } elseif ($comparison < 0) {
                    $value = -zingplayChiValue($pile, $evaluations[$rightId][$pile]);
                    $pair['rightWins']++;
                    $totals[$rightId]['chi'][$pile]['wins']++;
                    $totals[$leftId]['chi'][$pile]['losses']++;
                } else {
                    $totals[$leftId]['chi'][$pile]['ties']++;
                    $totals[$rightId]['chi'][$pile]['ties']++;
                }
                $pair['chi'][$pile] = $value;
                $pair['sum'] += $value;
            }
            if ($pair['leftWins'] === 3 || $pair['rightWins'] === 3) {
                $pair['multiplier'] = 2;
            }
            $pairs[] = $pair;
        }
    }

    // Sập làng: thắng sập hầm tất cả đối thủ (từ 3 người) thì mọi khoản thắng nhân đôi.
    // Cặp tới trắng có leftWins/rightWins = 0 nên không bao giờ góp vào sập hầm/sập làng.
    if ($count >= 3) {
        foreach ($players as $player) {
            $id = $player['id'];
            $sweptEveryone = true;
            foreach ($pairs as $pair) {
                if ($pair['left'] !== $id && $pair['right'] !== $id) {
                    continue;
                }
                $wins = $pair['left'] === $id ? $pair['leftWins'] : $pair['rightWins'];
                $sweptEveryone = $sweptEveryone && $wins === 3;
            }
            if (!$sweptEveryone) {
                continue;
            }
            $totals[$id]['sapLang'] = true;
            foreach ($pairs as &$pair) {
                if ($pair['left'] === $id || $pair['right'] === $id) {
                    $pair['multiplier'] *= 2;
                }
            }
            unset($pair);
        }
    }

    foreach ($pairs as $pair) {
        $amount = $pair['sum'] * $pair['multiplier'];
        $extra = $amount - $pair['sum'];
        $totals[$pair['left']]['points'] += $amount;
        $totals[$pair['right']]['points'] -= $amount;
        $totals[$pair['left']]['bonus'] += $extra;
        $totals[$pair['right']]['bonus'] -= $extra;
        if ($pair['white']) {
            $totals[$pair['left']]['whitePoints'] += $amount;
            $totals[$pair['right']]['whitePoints'] -= $amount;
        }
        foreach (ZINGPLAY_PILES as $pile) {
            $totals[$pair['left']]['chi'][$pile]['points'] += $pair['chi'][$pile];
            $totals[$pair['right']]['chi'][$pile]['points'] -= $pair['chi'][$pile];
        }
        // chi: điểm gốc từng chi (chưa nhân); sum = tổng chi (với cặp trắng = điểm tới trắng);
        // total = sum × multiplier — tất cả theo góc nhìn của người sở hữu mục.
        foreach ([['left', 'right', 1], ['right', 'left', -1]] as [$self, $other, $sign]) {
            $swept = $pair[$other . 'Wins'] === 3;
            $totals[$pair[$self]]['pairs'][] = [
                'opponentId' => $pair[$other],
                'chi' => array_map(static fn(int $value): int => $value * $sign, $pair['chi']),
                'sum' => $pair['sum'] * $sign,
                'multiplier' => $pair['multiplier'],
                'white' => $pair['white'],
                'total' => $amount * $sign,
                'sapHam' => $pair[$self . 'Wins'] === 3,
                'swept' => $swept,
            ];
        }
    }

    foreach ($totals as &$result) {
        foreach (ZINGPLAY_PILES as $pile) {
            $stats = $result['chi'][$pile];
            if ($stats['wins'] + $stats['losses'] + $stats['ties'] === 0 && $count > 1) {
                // Mọi cặp của người này đều có tới trắng (người trắng hoặc người thua trắng).
                $net = $result['whitePoints'];
                $result['chi'][$pile] = [
                    'outcome' => $net > 0 ? 'win' : ($net < 0 ? 'loss' : 'tie'),
                    'label' => $net > 0 ? 'Tới trắng' : ($net < 0 ? 'Thua tới trắng' : 'Hòa tới trắng'),
                    'hand' => $stats['hand'],
                    'points' => $stats['points'],
                ];
                continue;
            }
            $outcome = $stats['wins'] > $stats['losses']
                ? 'win'
                : ($stats['losses'] > $stats['wins'] ? 'loss' : 'tie');
            $label = $stats['wins'] === $stats['losses']
                ? ($stats['wins'] === 0 && $stats['ties'] > 0 ? 'Hòa' : 'Cân bằng')
                : ($stats['wins'] > $stats['losses']
                    ? 'Thắng ' . $stats['wins']
                    : 'Thua ' . $stats['losses']);
            $result['chi'][$pile] = [
                'outcome' => $outcome,
                'label' => $label,
                'hand' => $stats['hand'],
                'points' => $stats['points'],
            ];
        }
    }
    unset($result);
    return array_values($totals);
}

// Giá trị số nguyên của một chi: category × 15^5 + tieBreakers (cơ số 15, đệm 0 đến 5 phần tử).
function zingplayHandValue(array $evaluation): int
{
    $value = $evaluation['category'];
    for ($index = 0; $index < 5; $index++) {
        $value = $value * 15 + ($evaluation['tieBreakers'][$index] ?? 0);
    }
    return $value;
}

function zingplayCombinationMasks(int $size, int $total): array
{
    $masks = [];
    for ($mask = 0; $mask < (1 << $total); $mask++) {
        if (substr_count(decbin($mask), '1') === $size) {
            $masks[] = $mask;
        }
    }
    return $masks;
}

// Xếp bài tối ưu theo 3×chi cuối + 2×chi giữa + chi đầu, luôn không binh lủng.
// Quy ước xác định: lá được sắp (value tăng, rồi ♣<♦<♥<♠), bit i = lá thứ i; duyệt mask chi cuối tăng dần,
// với mỗi chi cuối duyệt mask chi giữa tăng dần; chỉ thay khi điểm lớn hơn hẳn; id mỗi chi theo thứ tự lá đã sắp.
function zingplayAutoArrange(array $cards13): array
{
    static $fiveMasks = null, $threeMasks = null, $middleCombos = null;
    if (count($cards13) !== 13) {
        throw new InvalidArgumentException('Cần đúng 13 lá để tự xếp bài.');
    }
    if ($fiveMasks === null) {
        $fiveMasks = zingplayCombinationMasks(5, 13);
        $threeMasks = zingplayCombinationMasks(3, 13);
        $middleCombos = [];
        foreach (zingplayCombinationMasks(5, 8) as $compact) {
            $positions = [];
            for ($bit = 0; $bit < 8; $bit++) {
                if ($compact & (1 << $bit)) {
                    $positions[] = $bit;
                }
            }
            $middleCombos[] = $positions;
        }
    }
    $suitOrder = array_flip(array_values(ZINGPLAY_SUITS));
    $cards = array_values($cards13);
    usort($cards, static fn(array $left, array $right): int =>
        ((int)$left['value'] <=> (int)$right['value'])
        ?: (($suitOrder[$left['suit']] ?? 9) <=> ($suitOrder[$right['suit']] ?? 9))
    );
    $pick = static function (int $mask) use ($cards): array {
        $subset = [];
        foreach ($cards as $index => $card) {
            if ($mask & (1 << $index)) {
                $subset[] = $card;
            }
        }
        return $subset;
    };
    $fiveValues = [];
    foreach ($fiveMasks as $mask) {
        $fiveValues[$mask] = zingplayHandValue(zingplayEvaluate($pick($mask)));
    }
    $threeValues = [];
    foreach ($threeMasks as $mask) {
        $threeValues[$mask] = zingplayHandValue(zingplayEvaluate($pick($mask)));
    }

    $bestScore = -1;
    $best = null;
    foreach ($fiveMasks as $backMask) {
        $backValue = $fiveValues[$backMask];
        $remaining = 8191 ^ $backMask;
        $bits = [];
        for ($index = 0; $index < 13; $index++) {
            if ($remaining & (1 << $index)) {
                $bits[] = 1 << $index;
            }
        }
        foreach ($middleCombos as $combo) {
            $middleMask = $bits[$combo[0]] | $bits[$combo[1]] | $bits[$combo[2]] | $bits[$combo[3]] | $bits[$combo[4]];
            $middleValue = $fiveValues[$middleMask];
            if ($middleValue > $backValue) {
                continue;
            }
            $frontMask = $remaining ^ $middleMask;
            $frontValue = $threeValues[$frontMask];
            if ($frontValue > $middleValue) {
                continue;
            }
            $score = 3 * $backValue + 2 * $middleValue + $frontValue;
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = [$frontMask, $middleMask, $backMask];
            }
        }
    }
    $ids = static fn(int $mask): array => array_column($pick($mask), 'id');
    return ['front' => $ids($best[0]), 'middle' => $ids($best[1]), 'back' => $ids($best[2])];
}

function zingplayMinBalance(int $stake): int
{
    return $stake * ZINGPLAY_MIN_BALANCE_MULTIPLIER;
}

// Người thua chỉ trả tối đa số dư; tổng tiền thắng được chia lại theo tỷ lệ để ván luôn cân bằng.
function zingplaySettleChips(array $deltas, array $balances): array
{
    $settled = [];
    $gains = [];
    $totalPaid = 0;
    $totalGain = 0;
    foreach ($deltas as $id => $delta) {
        if ($delta < 0) {
            $loss = min(-$delta, max(0, (int)($balances[$id] ?? 0)));
            $settled[$id] = -$loss;
            $totalPaid += $loss;
        } elseif ($delta > 0) {
            $gains[$id] = $delta;
            $totalGain += $delta;
        } else {
            $settled[$id] = 0;
        }
    }
    if ($totalPaid === $totalGain) {
        return $settled + $gains;
    }
    $remainders = [];
    $remaining = $totalPaid;
    foreach ($gains as $id => $gain) {
        $settled[$id] = intdiv($totalPaid * $gain, $totalGain);
        $remainders[$id] = ($totalPaid * $gain) % $totalGain;
        $remaining -= $settled[$id];
    }
    arsort($remainders);
    foreach (array_keys($remainders) as $id) {
        if ($remaining <= 0) {
            break;
        }
        $settled[$id]++;
        $remaining--;
    }
    return $settled;
}

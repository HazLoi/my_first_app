<?php
declare(strict_types=1);

final class TienLenRules
{
    private const SUITS = ['spades' => 0, 'clubs' => 1, 'diamonds' => 2, 'hearts' => 3];

    public static function strength(array $card): int
    {
        if (!isset($card['rank'], $card['suit']) || !is_int($card['rank'])
            || $card['rank'] < 2 || $card['rank'] > 14
            || !is_string($card['suit']) || !array_key_exists($card['suit'], self::SUITS)) {
            throw new InvalidArgumentException('Lá bài không hợp lệ.');
        }
        return ($card['rank'] === 2 ? 15 : $card['rank']) * 4 + self::SUITS[$card['suit']];
    }

    public static function classify(array $cards): ?array
    {
        if ($cards === [] || count($cards) > 13) {
            return null;
        }
        $seen = [];
        $counts = [];
        $maximum = 0;
        foreach ($cards as $card) {
            if (!is_array($card)) {
                return null;
            }
            try {
                $strength = self::strength($card);
            } catch (InvalidArgumentException) {
                return null;
            }
            if (isset($seen[$strength])) {
                return null;
            }
            $seen[$strength] = true;
            $maximum = max($maximum, $strength);
            $rank = $card['rank'];
            $counts[$rank] = ($counts[$rank] ?? 0) + 1;
        }
        $n = count($cards);
        $type = null;
        if (count($counts) === 1) {
            $type = [1 => 'single', 2 => 'pair', 3 => 'triple', 4 => 'four'][$n] ?? null;
        } elseif (!isset($counts[2])) {
            $ranks = array_keys($counts);
            sort($ranks, SORT_NUMERIC);
            $consecutive = end($ranks) - $ranks[0] + 1 === count($ranks);
            if ($consecutive && $n >= 3 && count($ranks) === $n) {
                $type = 'straight';
            } elseif ($consecutive && count($ranks) >= 3 && $n === 2 * count($ranks)
                && count(array_unique(array_values($counts))) === 1 && reset($counts) === 2) {
                $type = 'pairs_run';
            }
        }
        return $type === null ? null : ['type' => $type, 'count' => $n, 'strength' => $maximum, 'cards' => $cards];
    }

    public static function chopKey(array $combo): ?string
    {
        if ($combo['type'] === 'single' && $combo['cards'][0]['rank'] === 2) {
            return 'single_two';
        }
        if ($combo['type'] === 'pair' && $combo['cards'][0]['rank'] === 2) {
            return 'pair_twos';
        }
        if ($combo['type'] === 'four') {
            return 'four';
        }
        if ($combo['type'] === 'pairs_run' && in_array($combo['count'], [6, 8], true)) {
            return 'pairs_run_' . intdiv($combo['count'], 2);
        }
        return null;
    }

    public static function beats(array $candidate, array $table, array $config): bool
    {
        if ($candidate['type'] === $table['type'] && $candidate['count'] === $table['count']) {
            return $candidate['strength'] > $table['strength'];
        }
        $from = self::chopKey($candidate);
        $target = self::chopKey($table);
        return $from !== null && $target !== null
            && in_array($target, $config['chopRules'][$from] ?? [], true);
    }

    public static function whites(array $hand, array $config): array
    {
        if (!$config['whiteEnabled'] || count($hand) !== 13 || count(array_unique(array_map(
            [self::class, 'strength'], $hand
        ))) !== 13) {
            return [];
        }
        $counts = [];
        foreach ($hand as $card) {
            $counts[$card['rank']] = ($counts[$card['rank']] ?? 0) + 1;
        }
        $found = [];
        if (count(array_intersect(range(3, 14), array_keys($counts))) === 12) {
            $found[] = 'dragon';
        }
        if (($counts[2] ?? 0) === 4) {
            $found[] = 'four_twos';
        }
        if (array_sum(array_map(static fn(int $n): int => intdiv($n, 2), $counts)) >= 6) {
            $found[] = 'six_pairs';
        }
        for ($start = 3; $start <= 10; $start++) {
            $ok = true;
            for ($rank = $start; $rank < $start + 5; $rank++) {
                $ok = $ok && ($counts[$rank] ?? 0) >= 2;
            }
            if ($ok) {
                $found[] = 'five_pairs_run';
                break;
            }
        }
        if (($counts[3] ?? 0) === 4) {
            $found[] = 'four_threes';
        }
        return array_values(array_filter($config['whitePriority'], static fn(string $type): bool => in_array($type, $found, true)));
    }

    public static function whiteStrength(array $hand, string $type): int
    {
        $counts = array_count_values(array_column($hand, 'rank'));
        $eligible = array_filter($hand, static function (array $card) use ($type, $counts): bool {
            return match ($type) {
                'dragon' => $card['rank'] !== 2,
                'four_twos' => $card['rank'] === 2,
                'four_threes' => $card['rank'] === 3,
                'six_pairs' => $counts[$card['rank']] >= 2,
                'five_pairs_run' => $card['rank'] !== 2 && $counts[$card['rank']] >= 2,
                default => throw new InvalidArgumentException('Loại tới trắng không hợp lệ.'),
            };
        });
        if ($type === 'five_pairs_run') {
            $eligible = array_filter($eligible, static function (array $card) use ($counts): bool {
                for ($start = 3; $start <= 10; $start++) {
                    if ($card['rank'] < $start || $card['rank'] >= $start + 5) {
                        continue;
                    }
                    for ($rank = $start; $rank < $start + 5 && ($counts[$rank] ?? 0) >= 2; $rank++) {
                    }
                    if ($rank === $start + 5) {
                        return true;
                    }
                }
                return false;
            });
        }
        return max(array_map([self::class, 'strength'], $eligible));
    }

    public static function newRound(array $hands, ?string $previousWinner, array $config): array
    {
        if (count($hands) < 2 || count($hands) > 4) {
            throw new InvalidArgumentException('Cần từ 2 đến 4 người.');
        }
        $seen = [];
        $firstId = null;
        $smallest = PHP_INT_MAX;
        $whiteWinner = null;
        $whiteType = null;
        $whitePriority = PHP_INT_MAX;
        $whiteStrength = -1;
        foreach ($hands as $id => &$hand) {
            if (count($hand) !== 13) {
                throw new InvalidArgumentException('Mỗi người phải có 13 lá.');
            }
            usort($hand, static fn(array $a, array $b): int => self::strength($a) <=> self::strength($b));
            foreach ($hand as $card) {
                $strength = self::strength($card);
                if (isset($seen[$strength])) {
                    throw new InvalidArgumentException('Lá bài bị trùng.');
                }
                $seen[$strength] = true;
                if ($strength < $smallest) {
                    $smallest = $strength;
                    $firstId = (string)$id;
                }
            }
            $whites = self::whites($hand, $config);
            if ($whites !== []) {
                $priority = array_search($whites[0], $config['whitePriority'], true);
                $strength = self::whiteStrength($hand, $whites[0]);
                if ($priority < $whitePriority || ($priority === $whitePriority && $strength > $whiteStrength)) {
                    $whiteWinner = (string)$id;
                    $whiteType = $whites[0];
                    $whitePriority = $priority;
                    $whiteStrength = $strength;
                }
            }
        }
        unset($hand);
        $usePrevious = $config['winnerStarts'] && $previousWinner !== null && array_key_exists($previousWinner, $hands);
        return [
            'hands' => $hands, 'order' => array_map('strval', array_keys($hands)),
            'turn' => $usePrevious ? $previousWinner : $firstId,
            'required' => $usePrevious ? null : $hands[$firstId][0],
            'table' => null, 'lastPlayer' => null, 'passed' => [], 'ranking' => [],
            'played' => array_fill_keys(array_keys($hands), false),
            'timeouts' => array_fill_keys(array_keys($hands), 0),
            'auto' => array_fill_keys(array_keys($hands), false),
            'chops' => [], 'events' => [], 'whiteWinner' => $whiteWinner, 'whiteType' => $whiteType,
        ];
    }

    private static function nextEligible(array $state, string $after): ?string
    {
        $order = $state['order'];
        $index = array_search($after, $order, true);
        for ($i = 1; $i <= count($order); $i++) {
            $id = $order[($index + $i) % count($order)];
            if (!in_array($id, $state['ranking'], true) && !in_array($id, $state['passed'], true)) {
                return $id;
            }
        }
        return null;
    }

    public static function act(array &$state, string $id, array $action, array $config): void
    {
        if ($state['whiteWinner'] !== null || $state['turn'] !== $id || count($state['ranking']) >= count($state['order']) - 1) {
            throw new InvalidArgumentException('Chưa đến lượt của bạn.');
        }
        if (($action['type'] ?? null) === 'pass') {
            if ($state['table'] === null) {
                throw new InvalidArgumentException('Không thể bỏ lượt khi đi đầu vòng.');
            }
            $state['passed'][] = $id;
        } elseif (($action['type'] ?? null) === 'play') {
            $cards = $action['cards'] ?? null;
            $combo = is_array($cards) && array_is_list($cards) ? self::classify($cards) : null;
            if ($combo === null) {
                throw new InvalidArgumentException('Bộ bài không hợp lệ.');
            }
            $available = [];
            foreach ($state['hands'][$id] as $card) {
                $available[self::strength($card)] = true;
            }
            foreach ($cards as $card) {
                if (!isset($available[self::strength($card)])) {
                    throw new InvalidArgumentException('Bạn không có đủ các lá bài này.');
                }
            }
            $cards = array_map(static fn(array $card): array => ['rank' => $card['rank'], 'suit' => $card['suit']], $cards);
            $combo['cards'] = $cards;
            if ($state['required'] !== null && !in_array(self::strength($state['required']), array_map(
                [self::class, 'strength'], $cards
            ), true)) {
                throw new InvalidArgumentException('Nước đầu phải chứa lá bắt buộc.');
            }
            if ($state['table'] !== null && !self::beats($combo, $state['table'], $config)) {
                throw new InvalidArgumentException('Bộ bài không chặn được bộ trên bàn.');
            }
            if ($state['table'] !== null && self::chopKey($combo) !== null && self::chopKey($state['table']) !== null
                && !(in_array(self::chopKey($combo), ['single_two', 'pair_twos'], true)
                    && self::chopKey($combo) === self::chopKey($state['table']))) {
                $event = ['type' => 'chop', 'from' => $state['lastPlayer'], 'to' => $id, 'target' => $state['table']];
                $state['chops'][] = $event;
                $state['events'][] = $event;
            }
            $used = array_fill_keys(array_map([self::class, 'strength'], $cards), true);
            $state['hands'][$id] = array_values(array_filter(
                $state['hands'][$id], static fn(array $card): bool => !isset($used[self::strength($card)])
            ));
            $state['required'] = null;
            $state['played'][$id] = true;
            $state['table'] = $combo;
            $state['lastPlayer'] = $id;
            if ($state['hands'][$id] === []) {
                $state['ranking'][] = $id;
                if ($config['rankMode'] === 'first-only') {
                    $state['turn'] = null;
                    return;
                }
            }
        } else {
            throw new InvalidArgumentException('Hành động không hợp lệ.');
        }
        if (count($state['ranking']) === count($state['order']) - 1) {
            $state['ranking'][] = current(array_values(array_diff($state['order'], $state['ranking'])));
            $state['turn'] = null;
            return;
        }
        $next = self::nextEligible($state, $id);
        if ($next === null || $next === $state['lastPlayer']) {
            $state['table'] = null;
            $state['passed'] = [];
            $state['turn'] = in_array($state['lastPlayer'], $state['ranking'], true)
                ? self::nextEligible($state, $state['lastPlayer']) : $state['lastPlayer'];
        } else {
            $state['turn'] = $next;
        }
    }

    public static function autoAction(array $state): array
    {
        if ($state['table'] !== null) {
            return ['type' => 'pass'];
        }
        return ['type' => 'play', 'cards' => [$state['required'] ?? $state['hands'][$state['turn']][0]]];
    }

    public static function payments(array $state, int $bet, array $config): array
    {
        $ids = $state['order'];
        $details = array_fill_keys($ids, ['rank' => 0, 'chop' => 0, 'cold' => 0, 'rotten' => 0, 'white' => 0]);
        $transfer = static function (string $from, string $to, int $amount, string $category) use (&$details): void {
            $details[$from][$category] -= $amount;
            $details[$to][$category] += $amount;
        };
        if ($state['whiteWinner'] !== null) {
            foreach ($ids as $id) {
                if ($id !== $state['whiteWinner']) {
                    $transfer($id, $state['whiteWinner'], $bet * $config['whitePayment'], 'white');
                }
            }
            return $details;
        }
        $winner = $state['ranking'][0];
        if ($config['rankMode'] === 'first-only') {
            foreach ($ids as $id) {
                if ($id !== $winner) {
                    $transfer($id, $winner, $bet * $config['firstOnlyPoints'], 'rank');
                }
            }
        } else {
            foreach ($state['ranking'] as $index => $id) {
                $details[$id]['rank'] = $bet * $config['rankPoints'][count($ids)][$index];
            }
        }
        foreach ($ids as $id) {
            if ($id === $winner) {
                continue;
            }
            if (!$state['played'][$id]) {
                $last = abs(end($config['rankPoints'][count($ids)]));
                $transfer($id, $winner, $bet * $last * $config['coldMultiplier'], 'cold');
            }
            if ($config['rottenTwosEnabled']) {
                foreach ($state['hands'][$id] as $card) {
                    if ($card['rank'] === 2) {
                        $value = in_array($card['suit'], ['spades', 'clubs'], true) ? 'black_two' : 'red_two';
                        $transfer($id, $winner, $bet * $config['chopValues'][$value], 'rotten');
                    }
                }
            }
        }
        foreach ($state['chops'] as $chop) {
            $target = $chop['target'];
            $key = self::chopKey($target);
            $value = 0;
            if ($key === 'single_two' || $key === 'pair_twos') {
                foreach ($target['cards'] as $card) {
                    $color = in_array($card['suit'], ['spades', 'clubs'], true) ? 'black_two' : 'red_two';
                    $value += $config['chopValues'][$color];
                }
            } else {
                $value = $config['chopValues'][$key];
            }
            $transfer($chop['from'], $chop['to'], $bet * $value, 'chop');
        }
        return $details;
    }
}

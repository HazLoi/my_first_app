<?php
declare(strict_types=1);

final class TienLenScoring
{
    public static function calculate(array $state, array $matchTotals, array $config, int $targetScore): array
    {
        $ids = array_values($state['order']);
        $count = count($ids);
        $allIds = array_values(array_unique(array_merge(
            $state['matchPlayerIds'] ?? [],
            $ids,
            array_keys($matchTotals)
        )));
        $details = [];
        foreach ($allIds as $id) {
            $details[$id] = ['rank' => 0, 'chop' => 0, 'cold' => 0, 'rotten' => 0, 'white' => 0];
        }

        if ($state['whiteWinner'] !== null) {
            $winner = $state['whiteWinner'];
            $rankPoints = $config['rankPoints'][$count] ?? [0];
            $details[$winner]['rank'] = (int)($rankPoints[0] ?? 0);
            $details[$winner]['white'] = (int)($config['bonusPerOpponent'] ?? 2) * ($count - 1);
            foreach ($ids as $id) {
                if ($id !== $winner) {
                    $details[$id]['white'] = -2;
                }
            }
        } else {
            $rankPoints = $config['rankPoints'][$count] ?? [0];
            foreach ($state['ranking'] as $place => $id) {
                if (($config['coldEnabled'] ?? true)
                    && !($state['played'][$id] ?? false)
                    && count($state['hands'][$id] ?? []) === 13) {
                    continue;
                }
                $details[$id]['rank'] = (int)($rankPoints[$place] ?? 0);
            }
        }

        $values = array_map('abs', $config['chopValues'] ?? [
            'black_two' => -2, 'red_two' => -4, 'four' => -8, 'pairs_run_3' => -6, 'pairs_run_4' => -10,
        ]);
        $chops = TienLenRules::settleChops($state['chops'], $values, 1, $config);
        $baseValues = ['black_two' => 1, 'red_two' => 2, 'four' => 4, 'pairs_run_3' => 3, 'pairs_run_4' => 5];
        foreach ($chops['chains'] as &$chain) {
            $chain['units'] = array_sum(array_map(
                static fn(array $layer): int => TienLenRules::chopValue($layer['target'], $baseValues),
                $chain['layers']
            ));
        }
        unset($chain);
        foreach ($chops['deltas'] as $id => $delta) {
            $details[$id]['chop'] += $delta;
        }

        if (($config['coldEnabled'] ?? true) && $state['whiteWinner'] === null) {
            foreach ($ids as $id) {
                if (!($state['played'][$id] ?? false) && count($state['hands'][$id] ?? []) === 13) {
                    $details[$id]['cold'] = (int)($config['coldPenalty'] ?? -3);
                }
            }
        }

        if (($config['rottenEnabled'] ?? false) && $state['ranking'] !== []) {
            $winner = $state['ranking'][0];
            foreach ($ids as $id) {
                if ($id === $winner) continue;
                foreach ($state['hands'][$id] ?? [] as $card) {
                    if ($card['rank'] !== 2) continue;
                    $suit = in_array($card['suit'], ['spades', 'clubs'], true) ? 'black_two' : 'red_two';
                    $value = (int)($config['chopValues'][$suit] ?? ($suit === 'black_two' ? -2 : -4));
                    $details[$id]['rotten'] += $value;
                    $details[$winner]['rotten'] += abs($value);
                }
            }
        }

        $totals = [];
        foreach ($allIds as $id) {
            $roundTotal = array_sum($details[$id]);
            $details[$id]['round'] = $roundTotal;
            $totals[$id] = (int)($matchTotals[$id] ?? 0) + $roundTotal;
        }
        $matchEnded = (bool)($state['forcedMatchEnd'] ?? false);
        $matchTieIds = $matchEnded ? array_values($state['matchTieIds'] ?? []) : [];
        $eligible = array_values(array_filter($ids, static fn(string $id): bool => $totals[$id] >= $targetScore));
        if (!$matchEnded && $eligible !== []) {
            $maximum = max(array_map(static fn(string $id): int => $totals[$id], $eligible));
            $matchTieIds = array_values(array_filter($eligible, static fn(string $id): bool => $totals[$id] === $maximum));
            $matchEnded = count($matchTieIds) === 1;
        }
        return [
            'details' => $details,
            'totals' => $totals,
            'matchEnded' => $matchEnded,
            'matchTieIds' => $matchTieIds,
            'chopChains' => $chops['chains'],
        ];
    }
}

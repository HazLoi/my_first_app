<?php
declare(strict_types=1);

require_once __DIR__ . '/../GameEngine.php';
require_once __DIR__ . '/TienLenRules.php';
require_once __DIR__ . '/TienLenScoring.php';

final class TienLenEngine implements GameEngine
{
    private array $config;

    public function __construct()
    {
        $this->config = require __DIR__ . '/config.php';
        foreach (['turnSeconds', 'timeoutLimit'] as $key) {
            if (!is_int($this->config[$key] ?? null) || $this->config[$key] < 1) {
                throw new LogicException("Cấu hình Tiến Lên $key phải là số nguyên dương.");
            }
        }
        foreach (['summarySeconds', 'dealingSeconds', 'autoStartSeconds', 'whitePayment', 'firstOnlyPoints', 'coldMultiplier'] as $key) {
            if (!is_int($this->config[$key] ?? null) || $this->config[$key] < 0) {
                throw new LogicException("Cấu hình Tiến Lên $key phải là số nguyên không âm.");
            }
        }
        if (!in_array($this->config['rankMode'] ?? null, ['full', 'first-only'], true)) {
            throw new LogicException('Cấu hình rankMode không hợp lệ.');
        }
        foreach (['winnerStarts', 'whiteEnabled', 'rottenTwosEnabled'] as $key) {
            if (!is_bool($this->config[$key] ?? null)) {
                throw new LogicException("Cấu hình Tiến Lên $key phải là boolean.");
            }
        }
        $whiteTypes = ['dragon', 'four_twos', 'six_pairs', 'five_pairs_run', 'four_threes'];
        $priority = $this->config['whitePriority'] ?? null;
        if (!is_array($priority) || count($priority) !== count($whiteTypes)
            || count(array_unique($priority)) !== count($whiteTypes) || array_diff($whiteTypes, $priority) !== []) {
            throw new LogicException('Thứ tự ưu tiên tới trắng không hợp lệ.');
        }
        $chopTargets = ['single_two', 'pair_twos', 'four', 'pairs_run_3', 'pairs_run_4'];
        foreach (['four', 'pairs_run_3', 'pairs_run_4'] as $key) {
            $targets = $this->config['chopRules'][$key] ?? null;
            if (!is_array($targets) || array_diff($targets, $chopTargets) !== []) {
                throw new LogicException("Ma trận chặt $key không hợp lệ.");
            }
        }
        foreach ([2, 3, 4] as $count) {
            $points = $this->config['rankPoints'][$count] ?? null;
            if (!is_array($points) || !array_is_list($points) || count($points) !== $count
                || count(array_filter($points, 'is_int')) !== $count || array_sum($points) !== 0) {
                throw new LogicException("Bảng điểm $count người phải có tổng bằng 0.");
            }
        }
        foreach (['black_two', 'red_two', 'four', 'pairs_run_3', 'pairs_run_4'] as $key) {
            if (!isset($this->config['chopValues'][$key]) || !is_int($this->config['chopValues'][$key])
                || $this->config['chopValues'][$key] < 0) {
                throw new LogicException("Cấu hình chặt $key không hợp lệ.");
            }
        }
    }

    public function id(): string { return 'tienlen'; }
    public function minPlayers(): int { return 2; }
    public function maxPlayers(): int { return 4; }

    private function save(PDO $pdo, array &$table, array $state, string $phase, ?int $deadline, int $now, array $extra = []): void
    {
        zingplay_update_room($pdo, $table, $extra + [
            'game_state' => zingplay_json($state), 'phase' => $phase,
            'phase_started_at' => $now, 'phase_deadline' => $deadline,
        ], $now);
    }

    private function scoringConfig(array $table): array
    {
        $config = $this->config;
        $custom = $table['scoring_config'] ? json_decode((string)$table['scoring_config'], true) : [];
        if (is_array($custom)) {
            if (isset($custom['chopOverMode'])) $config['chopOverMode'] = $custom['chopOverMode'];
            if (isset($custom['coverShortfallByEarlierVictims'])) $config['coverShortfallByEarlierVictims'] = $custom['coverShortfallByEarlierVictims'];
        }
        if (($table['scoring_mode'] ?? 'coins') !== 'points') {
            $config['coldElimination'] = false;
            return $config;
        }
        $config['coldElimination'] = $config['coldEnabled'] ?? true;
        $config['chopValues'] = $config['defaultChopValues'];
        $config['rankPoints'] = $config['defaultRankPoints'];
        if (!is_array($custom) || $custom === []) {
            return $config;
        }
        if (isset($custom['rankPoints'])) $config['rankPoints'] = $custom['rankPoints'];
        if (isset($custom['chopValues'])) $config['chopValues'] = $custom['chopValues'];
        if (isset($custom['chopperGains'])) $config['chopperGains'] = $custom['chopperGains'];
        if (isset($custom['whiteEnabled'])) $config['whiteEnabled'] = $custom['whiteEnabled'];
        if (isset($custom['bonusPerOpponent'])) {
            $config['whitePayment'] = $custom['bonusPerOpponent'];
            $config['bonusPerOpponent'] = $custom['bonusPerOpponent'];
        }
        if (isset($custom['coldEnabled'])) $config['coldEnabled'] = $custom['coldEnabled'];
        $config['coldElimination'] = $config['coldEnabled'];
        if (isset($custom['coldPenalty'])) {
            $config['coldPenalty'] = $custom['coldPenalty'];
            $config['coldMultiplier'] = $custom['coldPenalty'];
        }
        if (isset($custom['rottenEnabled'])) {
            $config['rottenTwosEnabled'] = $custom['rottenEnabled'];
            $config['rottenEnabled'] = $custom['rottenEnabled'];
        }
        if (isset($custom['whiteTypes']) && is_array($custom['whiteTypes'])) {
            $config['whitePriority'] = array_values(array_filter(
                $config['whitePriority'],
                static fn(string $type): bool => $custom['whiteTypes'][$type] ?? false
            ));
            $config['whiteEnabled'] = $config['whiteEnabled'] && $config['whitePriority'] !== [];
        }
        return $config;
    }

    public function startRound(PDO $pdo, array &$table, array &$players, int $now): bool
    {
        $previous = $table['game_state'] ? json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR) : [];
        $pointsMode = ($table['scoring_mode'] ?? 'coins') === 'points';
        $balances = zingplay_lock_balances($pdo, array_column($players, 'user_id'));
        $delete = $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?');
        $removed = [];
        $removedUsers = $previous['removedUsers'] ?? [];
        foreach ($players as $player) {
            if ((int)$player['left_round'] === 1 || (!$pointsMode && $balances[$player['user_id']] <= 0)) {
                $delete->execute([$player['player_id']]);
                if (!$pointsMode && (int)$player['left_round'] === 0 && $balances[$player['user_id']] <= 0) {
                    $removed[] = $player['display_name'];
                    $removedUsers[] = $player['user_id'];
                }
            }
        }
        $removedUsers = array_values(array_unique($removedUsers));
        $players = array_values(array_filter($players, static fn(array $p): bool =>
            (int)$p['left_round'] === 0 && ($pointsMode || $balances[$p['user_id']] > 0)
        ));
        if ($players === []) {
            zingplay_mark_room_empty($pdo, $table, $now);
            return false;
        }
        zingplay_fix_host($pdo, $table, $players, $now);
        if (count($players) < 2) {
            $idleState = ['winner' => $previous['winner'] ?? null, 'removedUsers' => $removedUsers];
            if ($pointsMode && isset($previous['matchTotals'])) {
                $idleState = $previous;
                $idleState['matchEnded'] = true;
                $idleState['forcedMatchEnd'] = true;
                $idleState['matchTieIds'] = array_column($players, 'player_id');
            }
            $this->save($pdo, $table, $idleState, 'waiting', null, $now, [
                'status' => 'waiting', 'cancel_message' => $removed === [] ? null : 'Người hết xu đã rời bàn.',
            ]);
            return false;
        }
        $seed = zingplay_next_seed();
        $deck = array_map(static fn(array $card): array => [
            'rank' => $card['value'],
            'suit' => ['♠' => 'spades', '♣' => 'clubs', '♦' => 'diamonds', '♥' => 'hearts'][$card['suit']],
        ], zingplayShuffleWithSeed($seed));
        $hands = [];
        $tieIds = $previous['matchTieIds'] ?? [];
        $playoff = ($previous['matchEnded'] ?? false) === false
            && is_array($tieIds)
            && count($tieIds) > 1;
        $roundPlayers = $playoff ? array_values(array_filter(
            $players,
            static fn(array $player): bool => in_array($player['player_id'], $tieIds, true)
        )) : $players;
        if (count($roundPlayers) < 2) {
            $roundPlayers = $players;
            $playoff = false;
        }
        foreach ($roundPlayers as $index => $player) {
            $hands[$player['player_id']] = array_slice($deck, $index * 13, 13);
        }
        $roundConfig = $this->scoringConfig($table);
        $state = TienLenRules::newRound($hands, $previous['winner'] ?? null, $roundConfig);
        $state['winner'] = null;
        $state['removedUsers'] = $removedUsers;
        $state['results'] = null;
        if (($table['scoring_mode'] ?? 'coins') === 'points') {
            $newMatch = ($previous['matchEnded'] ?? false) || !isset($previous['historyId']);
            $state['matchTotals'] = $previous['matchEnded'] ?? false
                ? array_fill_keys(array_keys($hands), 0)
                : ($previous['matchTotals'] ?? array_fill_keys(array_keys($hands), 0));
            $state['matchPlayerIds'] = $previous['matchEnded'] ?? false
                ? array_keys($hands)
                : ($previous['matchPlayerIds'] ?? array_column($players, 'player_id'));
            $currentNames = array_column($players, 'display_name', 'player_id');
            $state['matchPlayerNames'] = $previous['matchEnded'] ?? false
                ? $currentNames
                : ($previous['matchPlayerNames'] ?? $currentNames);
            $state['matchLeft'] = $previous['matchEnded'] ?? false
                ? []
                : ($previous['matchLeft'] ?? []);
            $state['matchEnded'] = false;
            $state['forcedMatchEnd'] = false;
            $state['matchTieIds'] = [];
            $state['matchStarted'] = true;
            $state['historyId'] = $newMatch ? new_id() : $previous['historyId'];
            $state['historyStartedAt'] = $newMatch ? gmdate('Y-m-d H:i:s', $now) : $previous['historyStartedAt'];
            $state['historyTableName'] = $newMatch
                ? 'Bàn ' . ($players[0]['display_name'] ?? $table['code']) : $previous['historyTableName'];
            $state['historyRounds'] = $newMatch ? [] : $previous['historyRounds'];
            $state['historySaved'] = false;
            $state['matchPlayerUsers'] = $newMatch ? [] : ($previous['matchPlayerUsers'] ?? []);
            foreach ($roundPlayers as $player) {
                $id = $player['player_id'];
                if (!in_array($id, $state['matchPlayerIds'], true)) $state['matchPlayerIds'][] = $id;
                $state['matchPlayerNames'][$id] = $player['display_name'];
                $state['matchPlayerUsers'][$id] = $player['user_id'];
            }
        }
        $state['events'] = $removed === [] ? [] : [['type' => 'removed', 'names' => $removed]];
        $this->save($pdo, $table, $state, 'dealing', $now + $this->config['dealingSeconds'], $now, [
            'status' => 'playing', 'started_at' => gmdate('Y-m-d H:i:s', $now),
            'finished_at' => null, 'results_json' => null, 'cancel_message' => null,
            'round_no' => (int)$table['round_no'] + 1, 'seed' => $seed,
        ]);
        if ($state['whiteWinner'] !== null) {
            $state['events'][] = ['type' => 'white', 'player' => $state['whiteWinner'], 'whiteType' => $state['whiteType']];
            $table['game_state'] = zingplay_json($state);
            $this->finish($pdo, $table, $players, $state, $now);
        }
        return true;
    }

    public function applyAction(PDO $pdo, array &$table, array &$players, array $user, array $action, int $now): void
    {
        if ($table['phase'] !== 'playing') {
            throw new ApiException(409, 'Chưa đến lượt chơi.');
        }
        if ($table['phase_deadline'] !== null && (int)$table['phase_deadline'] <= $now) {
            throw new ApiException(409, 'Đã hết giờ lượt; vui lòng cập nhật trạng thái.');
        }
        $state = json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR);
        $id = null;
        foreach ($players as $player) {
            if ($player['user_id'] === $user['id'] && (int)$player['left_round'] === 0) {
                $id = $player['player_id'];
                break;
            }
        }
        if ($id === null || !isset($state['auto'][$id]) || $state['auto'][$id]) {
            throw new ApiException(409, 'Bạn không thể đánh trong ván này.');
        }
        try {
            TienLenRules::act($state, $id, $action, $this->scoringConfig($table));
        } catch (InvalidArgumentException $exception) {
            throw new ApiException(400, $exception->getMessage());
        }
        $state['timeouts'][$id] = 0;
        $this->afterAction($pdo, $table, $players, $state, $now);
    }

    private function afterAction(PDO $pdo, array &$table, array &$players, array $state, int $now): void
    {
        $roundConfig = $this->scoringConfig($table);
        while ($state['turn'] !== null && $state['auto'][$state['turn']]) {
            TienLenRules::act($state, $state['turn'], TienLenRules::autoAction($state), $roundConfig);
        }
        if ($state['turn'] === null) {
            $this->finish($pdo, $table, $players, $state, $now);
            return;
        }
        $this->save($pdo, $table, $state, 'playing', $now + $this->config['turnSeconds'], $now);
    }

    private function finish(PDO $pdo, array &$table, array &$players, array $state, int $now): void
    {
        if ($state['whiteWinner'] !== null) {
            $state['ranking'] = [$state['whiteWinner']];
            $state['turn'] = null;
        } else {
            $config = $this->scoringConfig($table);
            if (($config['coldElimination'] ?? false) && $state['ranking'] !== []) {
                foreach ($state['order'] as $id) {
                    if (!in_array($id, $state['ranking'], true)
                        && !$state['played'][$id]
                        && count($state['hands'][$id] ?? []) === 13) {
                        $state['ranking'][] = $id;
                        $state['events'][] = ['type' => 'cold', 'player' => $id];
                    }
                }
            }
        }
        $table['game_state'] = zingplay_json($state);
        $roundResults = $this->settle($pdo, $table, $players, $now);
        if (($table['scoring_mode'] ?? 'coins') === 'points') {
            $state = json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR);
        }
        $state['results'] = $roundResults;
        $state['winner'] = $state['whiteWinner'] ?? ($state['ranking'][0] ?? null);
        if (($table['scoring_mode'] ?? 'coins') === 'points') {
            $points = [];
            foreach ($roundResults['players'] as $result) {
                $points[$result['id']] = $result['roundPoints'];
            }
            $events = [];
            if ($state['chops'] !== []) $events[] = 'Chặt: ' . count($state['chops']);
            if (!empty($state['cold'])) $events[] = 'Cóng: ' . count($state['cold']);
            if ($state['whiteWinner'] !== null) $events[] = 'Tới trắng';
            if (count($state['historyRounds']) < gameplay_setting('history_round_limit', 1)) {
                $state['historyRounds'][] = ['points' => $points, 'events' => implode(', ', $events)];
            }
            if ($state['matchEnded']) save_tienlen_history($pdo, $table, $state, 'finished', $now);
        }
        foreach ($state['order'] as $id) {
            if ($id !== $state['winner'] && !$state['played'][$id] && $state['whiteWinner'] === null) {
                $state['events'][] = ['type' => 'cold', 'player' => $id];
            }
        }
        $summarySeconds = (($table['scoring_mode'] ?? 'coins') === 'points' && ($state['matchEnded'] ?? false))
            ? (int)$this->config['matchEndSeconds'] : $this->config['summarySeconds'];
        $this->save($pdo, $table, $state, 'summary', $now + $summarySeconds, $now, [
            'finished_at' => gmdate('Y-m-d H:i:s', $now), 'results_json' => zingplay_json($state['results']),
        ]);
    }

    private function settlePoints(PDO $pdo, array &$table, array &$players, array $state): array
    {
        $ids = $state['order'];
        if (!isset($state['historyId'])) {
            $state['historyId'] = new_id();
            $state['historyStartedAt'] = $table['started_at'] ?: gmdate('Y-m-d H:i:s');
            $state['historyTableName'] = 'Bàn ' . ($players[0]['display_name'] ?? $table['code']);
            $state['historyRounds'] = [];
            $state['matchPlayerUsers'] = array_column($players, 'user_id', 'player_id');
        }
        $config = $this->scoringConfig($table);
        $matchTotals = $state['matchTotals'] ?? array_fill_keys($ids, 0);
        $calculated = TienLenScoring::calculate(
            $state,
            $matchTotals,
            $config,
            (int)($table['target_score'] ?? 20)
        );
        $details = $calculated['details'];
        $totals = $calculated['totals'];
        $matchEnded = $calculated['matchEnded'];
        $matchTieIds = $calculated['matchTieIds'];
        $combinedTotals = $matchTotals;
        foreach ($totals as $id => $total) {
            $combinedTotals[$id] = $total;
        }
        $state['matchTotals'] = $combinedTotals;
        $state['matchEnded'] = $matchEnded;
        $state['matchTieIds'] = $matchTieIds;
        $table['game_state'] = zingplay_json($state);

        $results = [];
        $names = $state['matchPlayerNames'] ?? [];
        foreach ($players as $player) {
            $names[$player['player_id']] = $player['display_name'];
        }
        $rankedTotals = $totals;
        arsort($rankedTotals, SORT_NUMERIC);
        $matchPlaces = [];
        $lastTotal = null;
        $place = 0;
        $rank = 0;
        foreach ($rankedTotals as $id => $total) {
            $place++;
            if ($lastTotal === null || $total !== $lastTotal) {
                $rank = $place;
            }
            $matchPlaces[$id] = $rank;
            $lastTotal = $total;
        }
        foreach (array_keys($totals) as $id) {
            $position = array_search($id, $state['ranking'], true);
            $results[] = [
                'id' => $id,
                'name' => $names[$id] ?? '',
                'place' => $position === false ? null : $position + 1,
                'matchPlace' => $matchPlaces[$id] ?? null,
                'left' => (bool)($state['matchLeft'][$id] ?? false),
                'chips' => 0,
                'details' => $details[$id],
                'roundPoints' => $details[$id]['round'],
                'matchPoints' => $totals[$id],
                'matchEnded' => $matchEnded,
                'matchTieIds' => $matchTieIds,
            ];
        }
        return ['matchId' => new_id(), 'players' => $results, 'chopChains' => $calculated['chopChains']];
    }

    public function settle(PDO $pdo, array &$table, array &$players, int $now): array
    {
        $state = json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR);
        if (($table['scoring_mode'] ?? 'coins') === 'points') {
            return $this->settlePoints($pdo, $table, $players, $state);
        }
        $config = $this->scoringConfig($table);
        $withoutChops = $state;
        $withoutChops['chops'] = [];
        $details = TienLenRules::payments($withoutChops, (int)$table['stake'], $config);
        $participants = array_values(array_filter($players, static fn(array $p): bool => isset($details[$p['player_id']])));
        if (count($participants) !== count($state['order'])) {
            throw new LogicException('Thiếu người chơi khi thanh toán.');
        }
        $balances = zingplay_lock_balances($pdo, array_column($participants, 'user_id'));
        $byId = array_column($participants, 'user_id', 'player_id');
        $deltas = [];
        foreach ($details as $id => $parts) {
            $deltas[$id] = array_sum($parts);
        }
        $playerBalances = [];
        foreach ($byId as $id => $userId) {
            $playerBalances[$id] = $balances[$userId];
        }
        $settled = zingplaySettleChips($deltas, $playerBalances);
        foreach ($playerBalances as $id => $balance) {
            $playerBalances[$id] = $balance + $settled[$id];
        }
        $chopConfig = $config;
        $chopConfig['chopperGains'] = true;
        $chops = TienLenRules::settleChops($state['chops'], $config['chopValues'], (int)$table['stake'], $chopConfig, $playerBalances);
        foreach ($chops['deltas'] as $id => $delta) {
            $details[$id]['chop'] += $delta;
            $settled[$id] += $delta;
            $deltas[$id] += $delta;
        }
        $matchId = new_id();
        $update = $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?');
        $results = [];
        foreach ($participants as $player) {
            $id = $player['player_id'];
            $after = $balances[$player['user_id']] + $settled[$id];
            if ($settled[$id] !== 0) {
                $update->execute([$after, $player['user_id']]);
                record_wallet_transaction(
                    $pdo, $player['user_id'], 'match_result', $settled[$id], $after, null, null,
                    'Tiến Lên ' . $table['code'] . ' ván ' . $matchId
                );
            }
            $autoTopup = ensureMinCoins($pdo, $player['user_id']);
            $result = [
                'id' => $id, 'name' => $player['display_name'],
                'place' => $state['whiteWinner'] !== null ? ($id === $state['whiteWinner'] ? 1 : null)
                    : (($position = array_search($id, $state['ranking'], true)) === false ? null : $position + 1),
                'details' => $details[$id], 'uncapped' => $deltas[$id], 'chips' => $settled[$id],
                'balanceBefore' => $balances[$player['user_id']], 'balanceAfter' => user_balance($pdo, $player['user_id']),
            ];
            if ($autoTopup !== null) {
                $result['autoTopupAmount'] = $autoTopup;
            }
            $results[] = $result;
        }
        return ['matchId' => $matchId, 'players' => $results, 'chopChains' => $chops['chains']];
    }

    public function advanceIfDue(PDO $pdo, array $table): bool
    {
        $now = zingplay_now();
        if ($table['phase_deadline'] === null || (int)$table['phase_deadline'] > $now) {
            return false;
        }
        return zingplay_transaction($pdo, function () use ($pdo, $table, $now): bool {
            $room = zingplay_lock_room($pdo, $table['code']);
            if ($room === null || $room['game_type'] !== 'tienlen' || $room['phase_deadline'] === null
                || (int)$room['phase_deadline'] > $now) {
                return false;
            }
            $players = zingplay_lock_players($pdo, $room['code']);
            if ($room['phase'] === 'summary' || $room['phase'] === 'waiting') {
                $this->startRound($pdo, $room, $players, $now);
            } elseif ($room['phase'] === 'dealing') {
                $state = json_decode($room['game_state'], true, 512, JSON_THROW_ON_ERROR);
                $this->afterAction($pdo, $room, $players, $state, $now);
            } elseif ($room['phase'] === 'playing') {
                $state = json_decode($room['game_state'], true, 512, JSON_THROW_ON_ERROR);
                $id = $state['turn'];
                $state['timeouts'][$id]++;
                if ($state['timeouts'][$id] >= $this->config['timeoutLimit']) {
                    $state['auto'][$id] = true;
                }
                TienLenRules::act($state, $id, TienLenRules::autoAction($state), $this->scoringConfig($room));
                $this->afterAction($pdo, $room, $players, $state, $now);
            } else {
                throw new LogicException('Trạng thái Tiến Lên không hợp lệ.');
            }
            return true;
        });
    }

    public function leave(PDO $pdo, array &$table, array &$players, int $index, int $now): void
    {
        $id = $players[$index]['player_id'];
        if (in_array($table['phase'], ['dealing', 'playing'], true)) {
            $state = json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR);
            if (!isset($state['hands'][$id])) {
                $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$id]);
                array_splice($players, $index, 1);
                zingplay_fix_host($pdo, $table, $players, $now);
                zingplay_update_room($pdo, $table, [], $now);
                return;
            }
            $pdo->prepare('UPDATE game_room_players SET left_round = 1 WHERE player_id = ?')->execute([$id]);
            $players[$index]['left_round'] = 1;
            $state['auto'][$id] = true;
            if (($table['scoring_mode'] ?? 'coins') === 'points') {
                $state['matchLeft'][$id] = true;
            }
            if (zingplay_active_players($players) === []) {
                zingplay_mark_room_empty($pdo, $table, $now);
            }
            $remaining = array_values(array_filter(
                $players,
                static fn(array $player): bool => (int)$player['left_round'] === 0
                    && isset($state['hands'][$player['player_id']])
            ));
            if (($table['scoring_mode'] ?? 'coins') === 'points' && count($remaining) < 2) {
                $state['matchEnded'] = true;
                $state['forcedMatchEnd'] = true;
                $state['matchTieIds'] = array_map(
                    static fn(array $player): string => $player['player_id'],
                    $remaining
                );
                $state['events'][] = ['type' => 'match-ended'];
                $state['turn'] = null;
                save_tienlen_history($pdo, $table, $state, 'abandoned', $now);
                zingplay_fix_host($pdo, $table, $players, $now);
                $this->save($pdo, $table, $state, 'summary', $now + (int)$this->config['matchEndSeconds'], $now);
                return;
            }
            zingplay_fix_host($pdo, $table, $players, $now);
            if ($table['phase'] === 'playing') {
                if (($state['matchEnded'] ?? false) && ($table['scoring_mode'] ?? 'coins') === 'points') {
                    $this->finish($pdo, $table, $players, $state, $now);
                } elseif ($state['turn'] === $id) {
                    $this->afterAction($pdo, $table, $players, $state, $now);
                } else {
                    $this->save($pdo, $table, $state, 'playing', (int)$table['phase_deadline'], $now);
                }
            } else {
                $this->save($pdo, $table, $state, $table['phase'], (int)$table['phase_deadline'], $now);
            }
            return;
        }
        if (($table['scoring_mode'] ?? 'coins') === 'points'
            && $table['phase'] === 'summary'
            && isset(json_decode((string)$table['game_state'], true)['matchTotals'])) {
            $state = json_decode((string)$table['game_state'], true, 512, JSON_THROW_ON_ERROR);
            $pdo->prepare('UPDATE game_room_players SET left_round = 1 WHERE player_id = ?')->execute([$id]);
            $players[$index]['left_round'] = 1;
            $state['matchLeft'][$id] = true;
            zingplay_fix_host($pdo, $table, $players, $now);
            $active = array_values(array_filter(
                $players,
                static fn(array $player): bool => (int)$player['left_round'] === 0
            ));
            if ($active === []) zingplay_mark_room_empty($pdo, $table, $now);
            $results = $state['results'] ?? ['players' => []];
            foreach ($results['players'] as &$result) {
                if ($result['id'] === $id) $result['left'] = true;
            }
            unset($result);
            $state['results'] = $results;
            if (count($active) < 2) {
                $state['matchEnded'] = true;
                $state['forcedMatchEnd'] = true;
                $state['matchTieIds'] = array_column($active, 'player_id');
                $state['events'][] = ['type' => 'match-ended'];
                foreach ($results['players'] as &$result) {
                    $result['matchEnded'] = true;
                    $result['matchTieIds'] = $state['matchTieIds'];
                }
                unset($result);
                $state['results'] = $results;
                save_tienlen_history($pdo, $table, $state, 'abandoned', $now);
            }
            $deadline = count($active) < 2 ? $now + (int)$this->config['matchEndSeconds'] : (int)$table['phase_deadline'];
            $this->save($pdo, $table, $state, 'summary', $deadline, $now, [
                'results_json' => zingplay_json($results),
            ]);
            return;
        }
        $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$id]);
        array_splice($players, $index, 1);
        if ($players === []) {
            zingplay_mark_room_empty($pdo, $table, $now);
            return;
        }
        zingplay_fix_host($pdo, $table, $players, $now);
        zingplay_update_room($pdo, $table, [], $now);
    }

    public function viewFor(PDO $pdo, array $user, string $code): array
    {
        $statement = $pdo->prepare('SELECT * FROM game_rooms WHERE code = ?');
        $statement->execute([$code]);
        $table = $statement->fetch();
        if (!$table || $table['game_type'] !== 'tienlen') {
            throw new ApiException(404, 'Không tìm thấy bàn Tiến Lên.');
        }
        $statement = $pdo->prepare('SELECT p.*, u.balance FROM game_room_players p JOIN users u ON u.id = p.user_id
            WHERE p.room_code = ? ORDER BY p.seat_number');
        $statement->execute([$code]);
        $players = $statement->fetchAll();
        $self = null;
        foreach ($players as $player) {
            if ($player['user_id'] === $user['id'] && (int)$player['left_round'] === 0) {
                $self = $player;
                break;
            }
        }
        if ($self === null) {
            throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
        }
        $state = $table['game_state'] ? json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR) : [];
        $publicPlayers = [];
        $matchPlayers = [];
        foreach ($state['matchPlayerIds'] ?? [] as $playerId) {
            $matchPlayers[] = [
                'id' => $playerId,
                'name' => $state['matchPlayerNames'][$playerId] ?? '',
                'left' => (bool)($state['matchLeft'][$playerId] ?? false),
            ];
        }
        foreach ($players as $player) {
            if ((int)$player['left_round'] === 1 && ($table['scoring_mode'] ?? 'coins') !== 'points') {
                continue;
            }
            $publicPlayers[] = ['id' => $player['player_id'], 'name' => $player['display_name'],
                'seat' => (int)$player['seat_number'], 'balance' => (int)$player['balance'],
                'spectator' => $table['phase'] !== 'waiting' && !isset($state['hands'][$player['player_id']]),
                'left' => (int)$player['left_round'] === 1,
                'cardCount' => count($state['hands'][$player['player_id']] ?? [])];
        }
        return [
            'serverTime' => zingplay_now_ms(), 'version' => (int)$table['version'], 'playerId' => $self['player_id'],
            'room' => ['code' => $code, 'gameType' => 'tienlen', 'hostId' => $table['host_player_id'],
                'phase' => $table['phase'], 'stake' => (int)$table['stake'], 'round' => (int)$table['round_no'],
                'maxPlayers' => (int)$table['max_players'], 'autoPlay' => (bool)$table['auto_play'],
                'deadline' => $table['phase_deadline'] === null ? null : (int)$table['phase_deadline'] * 1000,
                'players' => $publicPlayers, 'message' => $table['cancel_message'],
                'scoringMode' => $table['scoring_mode'] ?? 'coins',
                'targetScore' => (int)($table['target_score'] ?? 20),
                'scoringConfig' => $table['scoring_config'] ? json_decode((string)$table['scoring_config'], true) : []],
            'cards' => $state['hands'][$self['player_id']] ?? [],
            'turn' => $state['turn'] ?? null, 'table' => $state['table'] ?? null,
            'lastPlayer' => $state['lastPlayer'] ?? null, 'passed' => $state['passed'] ?? [],
            'ranking' => $state['ranking'] ?? [], 'events' => array_slice($state['events'] ?? [], -10),
            'required' => isset($state['required']) && $state['turn'] === $self['player_id'] ? $state['required'] : null,
            'chopRules' => $this->config['chopRules'], 'turnSeconds' => $this->config['turnSeconds'],
            'results' => $table['phase'] === 'summary' ? ($state['results'] ?? null) : null,
            'matchTotals' => $state['matchTotals'] ?? null,
            'matchEnded' => $state['matchEnded'] ?? false,
            'matchPlayers' => $matchPlayers,
        ];
    }
}

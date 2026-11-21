<?php
declare(strict_types=1);

require_once __DIR__ . '/../GameEngine.php';
require_once __DIR__ . '/TienLenRules.php';

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

    public function startRound(PDO $pdo, array &$table, array &$players, int $now): bool
    {
        $previous = $table['game_state'] ? json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR) : [];
        $balances = zingplay_lock_balances($pdo, array_column($players, 'user_id'));
        $delete = $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?');
        $removed = [];
        $removedUsers = $previous['removedUsers'] ?? [];
        foreach ($players as $player) {
            if ((int)$player['left_round'] === 1 || $balances[$player['user_id']] <= 0) {
                $delete->execute([$player['player_id']]);
                if ((int)$player['left_round'] === 0 && $balances[$player['user_id']] <= 0) {
                    $removed[] = $player['display_name'];
                    $removedUsers[] = $player['user_id'];
                }
            }
        }
        $removedUsers = array_values(array_unique($removedUsers));
        $players = array_values(array_filter($players, static fn(array $p): bool =>
            (int)$p['left_round'] === 0 && $balances[$p['user_id']] > 0
        ));
        if ($players === []) {
            zingplay_delete_room($pdo, $table);
            return false;
        }
        zingplay_fix_host($pdo, $table, $players, $now);
        if (count($players) < 2) {
            $this->save($pdo, $table, ['winner' => $previous['winner'] ?? null, 'removedUsers' => $removedUsers], 'waiting', null, $now, [
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
        foreach ($players as $index => $player) {
            $hands[$player['player_id']] = array_slice($deck, $index * 13, 13);
        }
        $state = TienLenRules::newRound($hands, $previous['winner'] ?? null, $this->config);
        $state['winner'] = null;
        $state['removedUsers'] = $removedUsers;
        $state['results'] = null;
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
            TienLenRules::act($state, $id, $action, $this->config);
        } catch (InvalidArgumentException $exception) {
            throw new ApiException(400, $exception->getMessage());
        }
        $state['timeouts'][$id] = 0;
        $this->afterAction($pdo, $table, $players, $state, $now);
    }

    private function afterAction(PDO $pdo, array &$table, array &$players, array $state, int $now): void
    {
        while ($state['turn'] !== null && $state['auto'][$state['turn']]) {
            TienLenRules::act($state, $state['turn'], TienLenRules::autoAction($state), $this->config);
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
        }
        $table['game_state'] = zingplay_json($state);
        $state['results'] = $this->settle($pdo, $table, $players, $now);
        $state['winner'] = $state['whiteWinner'] ?? $state['ranking'][0];
        foreach ($state['order'] as $id) {
            if ($id !== $state['winner'] && !$state['played'][$id] && $state['whiteWinner'] === null) {
                $state['events'][] = ['type' => 'cold', 'player' => $id];
            }
        }
        $this->save($pdo, $table, $state, 'summary', $now + $this->config['summarySeconds'], $now, [
            'finished_at' => gmdate('Y-m-d H:i:s', $now), 'results_json' => zingplay_json($state['results']),
        ]);
    }

    public function settle(PDO $pdo, array &$table, array &$players, int $now): array
    {
        $state = json_decode($table['game_state'], true, 512, JSON_THROW_ON_ERROR);
        $details = TienLenRules::payments($state, (int)$table['stake'], $this->config);
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
            $results[] = [
                'id' => $id, 'name' => $player['display_name'],
                'place' => $state['whiteWinner'] !== null ? ($id === $state['whiteWinner'] ? 1 : null)
                    : (($position = array_search($id, $state['ranking'], true)) === false ? null : $position + 1),
                'details' => $details[$id], 'uncapped' => $deltas[$id], 'chips' => $settled[$id],
                'balanceBefore' => $balances[$player['user_id']], 'balanceAfter' => $after,
            ];
        }
        return ['matchId' => $matchId, 'players' => $results];
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
                TienLenRules::act($state, $id, TienLenRules::autoAction($state), $this->config);
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
            zingplay_fix_host($pdo, $table, $players, $now);
            if ($table['phase'] === 'playing') {
                if ($state['turn'] === $id) {
                    $this->afterAction($pdo, $table, $players, $state, $now);
                } else {
                    $this->save($pdo, $table, $state, 'playing', (int)$table['phase_deadline'], $now);
                }
            } else {
                $this->save($pdo, $table, $state, $table['phase'], (int)$table['phase_deadline'], $now);
            }
            return;
        }
        $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$id]);
        array_splice($players, $index, 1);
        if ($players === []) {
            zingplay_delete_room($pdo, $table);
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
        foreach ($players as $player) {
            if ((int)$player['left_round'] === 1) {
                continue;
            }
            $publicPlayers[] = ['id' => $player['player_id'], 'name' => $player['display_name'],
                'seat' => (int)$player['seat_number'], 'balance' => (int)$player['balance'],
                'spectator' => $table['phase'] !== 'waiting' && !isset($state['hands'][$player['player_id']]),
                'cardCount' => count($state['hands'][$player['player_id']] ?? [])];
        }
        return [
            'serverTime' => zingplay_now_ms(), 'version' => (int)$table['version'], 'playerId' => $self['player_id'],
            'room' => ['code' => $code, 'gameType' => 'tienlen', 'hostId' => $table['host_player_id'],
                'phase' => $table['phase'], 'stake' => (int)$table['stake'], 'round' => (int)$table['round_no'],
                'maxPlayers' => (int)$table['max_players'], 'autoPlay' => (bool)$table['auto_play'],
                'deadline' => $table['phase_deadline'] === null ? null : (int)$table['phase_deadline'] * 1000,
                'players' => $publicPlayers, 'message' => $table['cancel_message']],
            'cards' => $state['hands'][$self['player_id']] ?? [],
            'turn' => $state['turn'] ?? null, 'table' => $state['table'] ?? null,
            'lastPlayer' => $state['lastPlayer'] ?? null, 'passed' => $state['passed'] ?? [],
            'ranking' => $state['ranking'] ?? [], 'events' => array_slice($state['events'] ?? [], -10),
            'required' => isset($state['required']) && $state['turn'] === $self['player_id'] ? $state['required'] : null,
            'chopRules' => $this->config['chopRules'], 'turnSeconds' => $this->config['turnSeconds'],
            'results' => $table['phase'] === 'summary' ? ($state['results'] ?? null) : null,
        ];
    }
}

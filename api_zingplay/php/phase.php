<?php
declare(strict_types=1);

// Máy trạng thái phòng thời gian thực (ZingPlay v2). Chỉ chạy với game_rooms.auto_play = 1.
// Mọi thời điểm lưu trong DB là unix giây UTC; API trả về mili-giây.

const ZINGPLAY_PHASES = ['waiting', 'dealing', 'arranging', 'revealing', 'scoring', 'summary', 'next'];
const ZINGPLAY_RESULT_PHASES = ['revealing', 'scoring', 'summary', 'next'];
const ZINGPLAY_PHASE_SECONDS = [
    'dealing' => 3,
    'arranging' => 60,
    'revealing' => 9,
    'scoring' => 3,
    'summary' => 5,
    'next' => 3,
    'auto_start' => 3,
];
const ZINGPLAY_LONG_POLL_SECONDS = 15;
const ZINGPLAY_LONG_POLL_STEP_MICROSECONDS = 400000;

function zingplay_now(): int
{
    return (int)($GLOBALS['ZINGPLAY_NOW'] ?? time());
}

function zingplay_now_ms(): int
{
    return isset($GLOBALS['ZINGPLAY_NOW'])
        ? (int)$GLOBALS['ZINGPLAY_NOW'] * 1000
        : (int)round(microtime(true) * 1000);
}

// Đọc config/config.php (hoặc config.php cũ). Khóa dùng ở đây: `phase_seconds` (mảng ghi đè), `long_poll` (bool).
function zingplay_config(): array
{
    if (isset($GLOBALS['ZINGPLAY_CONFIG']) && is_array($GLOBALS['ZINGPLAY_CONFIG'])) {
        return $GLOBALS['ZINGPLAY_CONFIG'];
    }
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $config = [];
    foreach ([__DIR__ . '/config/config.php', __DIR__ . '/config.php'] as $path) {
        if (!is_file($path)) {
            continue;
        }
        try {
            $loaded = require $path;
            $config = is_array($loaded) ? $loaded : [];
        } catch (Throwable) {
            $config = [];
        }
        break;
    }
    return $config;
}

function zingplay_phase_seconds(string $key): int
{
    $override = zingplay_config()['phase_seconds'][$key] ?? null;
    return is_int($override) && $override >= 0 ? $override : ZINGPLAY_PHASE_SECONDS[$key];
}

function zingplay_long_poll_enabled(): bool
{
    return (zingplay_config()['long_poll'] ?? false) === true;
}

// Cho phép test cố định seed ($GLOBALS['ZINGPLAY_SEED_QUEUE']); production luôn sinh ngẫu nhiên.
function zingplay_next_seed(): string
{
    $queue = $GLOBALS['ZINGPLAY_SEED_QUEUE'] ?? null;
    if (is_array($queue) && $queue !== []) {
        $seed = array_shift($queue);
        $GLOBALS['ZINGPLAY_SEED_QUEUE'] = $queue;
        return $seed;
    }
    return zingplayNewSeed();
}

function zingplay_is_deadlock(Throwable $exception): bool
{
    return $exception instanceof PDOException && in_array($exception->errorInfo[1] ?? null, [1213, 1205], true);
}

// Chạy `$callback` trong transaction; thử lại khi MySQL báo deadlock / hết thời gian chờ khóa.
function zingplay_transaction(PDO $pdo, callable $callback): mixed
{
    for ($attempt = 1;; $attempt++) {
        $pdo->beginTransaction();
        try {
            $result = $callback();
            $pdo->commit();
            return $result;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($attempt >= 3 || !zingplay_is_deadlock($exception)) {
                throw $exception;
            }
            usleep(random_int(20000, 60000));
        }
    }
}

function zingplay_hand(array $player): array
{
    $hand = $player['hand_json'] === null ? [] : json_decode((string)$player['hand_json'], true);
    return is_array($hand) ? $hand : [];
}

// Người tham gia ván = có đủ 13 lá; khán giả vào giữa ván có hand_json = [].
function zingplay_is_participant(array $player): bool
{
    return count(zingplay_hand($player)) === 13;
}

function zingplay_json(mixed $value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function zingplay_lock_room(PDO $pdo, string $code): ?array
{
    $statement = $pdo->prepare('SELECT * FROM game_rooms WHERE code = ?' . lock_clause($pdo));
    $statement->execute([$code]);
    return $statement->fetch() ?: null;
}

function zingplay_lock_players(PDO $pdo, string $code): array
{
    $statement = $pdo->prepare(
        'SELECT * FROM game_room_players WHERE room_code = ? ORDER BY seat_number' . lock_clause($pdo),
    );
    $statement->execute([$code]);
    return $statement->fetchAll();
}

function zingplay_lock_balances(PDO $pdo, array $userIds): array
{
    if ($userIds === []) {
        return [];
    }
    sort($userIds);
    $statement = $pdo->prepare(
        'SELECT id, balance FROM users WHERE id IN (' . implode(',', array_fill(0, count($userIds), '?')) . ') ORDER BY id'
        . lock_clause($pdo),
    );
    $statement->execute($userIds);
    $balances = [];
    foreach ($statement->fetchAll() as $row) {
        $balances[$row['id']] = (int)$row['balance'];
    }
    return $balances;
}

// Cập nhật phòng: `$fields` là cột => giá trị (tên cột do code nội bộ truyền vào). Luôn tăng version.
function zingplay_update_room(PDO $pdo, array &$room, array $fields, int $now): void
{
    $fields['last_activity'] = $now;
    $assignments = [];
    $values = [];
    foreach ($fields as $column => $value) {
        $assignments[] = $column . ' = ?';
        $values[] = $value;
    }
    $values[] = $room['code'];
    $pdo->prepare('UPDATE game_rooms SET ' . implode(', ', $assignments) . ', version = version + 1 WHERE code = ?')
        ->execute($values);
    foreach ($fields as $column => $value) {
        $room[$column] = $value;
    }
    $room['version'] = (int)$room['version'] + 1;
}

function zingplay_set_phase(PDO $pdo, array &$room, string $phase, ?int $seconds, int $now, array $extra = []): void
{
    zingplay_update_room($pdo, $room, $extra + [
        'phase' => $phase,
        'phase_started_at' => $now,
        'phase_deadline' => $seconds === null ? null : $now + $seconds,
    ], $now);
}

function zingplay_delete_room(PDO $pdo, array &$room): void
{
    $pdo->prepare('DELETE FROM game_room_players WHERE room_code = ?')->execute([$room['code']]);
    $pdo->prepare('DELETE FROM game_rooms WHERE code = ?')->execute([$room['code']]);
    $room['deleted'] = true;
}

function zingplay_mark_room_empty(PDO $pdo, array &$room, int $now): void
{
    if (($room['empty_since'] ?? null) === null) {
        zingplay_update_room($pdo, $room, ['empty_since' => $now], $now);
    }
}

function zingplay_active_players(array $players): array
{
    return array_values(array_filter($players, static fn(array $player): bool => (int)$player['left_round'] === 0));
}

// Chủ phòng không còn trong danh sách thì chuyển cho người kế tiếp (theo ghế).
function zingplay_fix_host(PDO $pdo, array &$room, array $players, int $now): void
{
    $active = zingplay_active_players($players);
    if ($active === []) {
        return;
    }
    foreach ($active as $player) {
        if ($player['player_id'] === $room['host_player_id']) {
            return;
        }
    }
    zingplay_update_room($pdo, $room, ['host_player_id' => $active[0]['player_id']], $now);
}

// Về phòng chờ: xóa bài/bố cục; đủ max_players thì hẹn tự bắt đầu sau AUTO_START_DELAY.
function zingplay_reset_to_waiting(
    PDO $pdo,
    array &$room,
    array &$players,
    int $now,
    ?string $message = null,
): void {
    $pdo->prepare("UPDATE game_room_players SET hand_json = '[]', arrangement_json = NULL WHERE room_code = ?")
        ->execute([$room['code']]);
    foreach ($players as &$player) {
        $player['hand_json'] = '[]';
        $player['arrangement_json'] = null;
    }
    unset($player);
    $full = count($players) >= 2 && count($players) >= (int)$room['max_players'];
    zingplay_fix_host($pdo, $room, $players, $now);
    zingplay_set_phase(
        $pdo,
        $room,
        'waiting',
        $full ? zingplay_phase_seconds('auto_start') : null,
        $now,
        ['status' => 'waiting', 'results_json' => null, 'cancel_message' => $message],
    );
}

// Hủy ván đang chạy (không đổi xu): xóa người "ma", mọi người còn lại về phòng chờ.
function zingplay_cancel_round(PDO $pdo, array &$room, array &$players, int $now, string $message): void
{
    $pdo->prepare('DELETE FROM game_room_players WHERE room_code = ? AND left_round = 1')->execute([$room['code']]);
    $players = zingplay_active_players($players);
    if ($players === []) {
        zingplay_mark_room_empty($pdo, $room, $now);
        return;
    }
    zingplay_reset_to_waiting($pdo, $room, $players, $now, $message);
}

// Bắt đầu ván mới. Trả về false nếu không đủ người (phòng về waiting hoặc bị xóa).
function zingplay_start_round(PDO $pdo, array &$room, array &$players, int $now): bool
{
    $stake = (int)$room['stake'];
    $balances = zingplay_lock_balances($pdo, array_column($players, 'user_id'));
    $minimum = zingplayMinBalance($stake);
    $idleLimit = $now - gameplay_setting('room_player_idle_seconds', 1);
    $removeIds = [];
    foreach ($players as $player) {
        $lastSeen = (int)$player['last_seen'];
        if ((int)$player['left_round'] === 1
            || ($balances[$player['user_id']] ?? 0) < $minimum
            || ($lastSeen > 0 && $lastSeen < $idleLimit)) {
            $removeIds[] = $player['player_id'];
        }
    }
    if ($removeIds !== []) {
        $delete = $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?');
        foreach ($removeIds as $playerId) {
            $delete->execute([$playerId]);
        }
        $players = array_values(array_filter(
            $players,
            static fn(array $player): bool => !in_array($player['player_id'], $removeIds, true),
        ));
    }
    if ($players === []) {
        zingplay_mark_room_empty($pdo, $room, $now);
        return false;
    }
    if (count($players) < 2) {
        zingplay_reset_to_waiting($pdo, $room, $players, $now);
        return false;
    }

    $seed = zingplay_next_seed();
    $deck = zingplayShuffleWithSeed($seed);
    $update = $pdo->prepare('UPDATE game_room_players SET hand_json = ?, arrangement_json = NULL WHERE player_id = ?');
    foreach ($players as $index => &$player) {
        $player['hand_json'] = zingplay_json(array_slice($deck, $index * 13, 13));
        $player['arrangement_json'] = null;
        $update->execute([$player['hand_json'], $player['player_id']]);
    }
    unset($player);
    zingplay_fix_host($pdo, $room, $players, $now);
    zingplay_set_phase($pdo, $room, 'dealing', zingplay_phase_seconds('dealing'), $now, [
        'status' => 'playing',
        'started_at' => gmdate('Y-m-d H:i:s', $now),
        'finished_at' => null,
        'results_json' => null,
        'cancel_message' => null,
        'round_no' => (int)$room['round_no'] + 1,
        'seed' => $seed,
    ]);
    return true;
}

// Tính điểm, thanh toán xu, lưu lịch sử; tự xếp bài cho ai chưa nộp. Dưới 2 người thật thì hủy ván.
function zingplay_finish_round(PDO $pdo, array &$room, array &$players, int $now): void
{
    $participantIndexes = [];
    foreach ($players as $index => $player) {
        if (zingplay_is_participant($player)) {
            $participantIndexes[] = $index;
        }
    }
    $activeParticipants = array_filter(
        $participantIndexes,
        static fn(int $index): bool => (int)$players[$index]['left_round'] === 0,
    );
    if (count($activeParticipants) < 2) {
        zingplay_cancel_round($pdo, $room, $players, $now, 'Không đủ người chơi nên ván bị hủy, xu không thay đổi.');
        return;
    }
    $storeArrangement = $pdo->prepare('UPDATE game_room_players SET arrangement_json = ? WHERE player_id = ?');
    foreach ($participantIndexes as $index) {
        if ($players[$index]['arrangement_json'] !== null) {
            continue;
        }
        $hand = zingplay_hand($players[$index]);
        $validation = zingplayValidateArrangement($hand, zingplayAutoArrange($hand));
        $players[$index]['arrangement_json'] = zingplay_json($validation['hands']);
        $storeArrangement->execute([$players[$index]['arrangement_json'], $players[$index]['player_id']]);
    }
    $participants = array_map(static fn(int $index): array => $players[$index], $participantIndexes);
    $stake = (int)$room['stake'];
    $matchId = new_id();
    $results = settle_match_chips($pdo, $participants, zingplayCompareResults(array_map(
        static fn(array $player): array => [
            'id' => $player['player_id'],
            'name' => $player['display_name'],
            'hands' => json_decode((string)$player['arrangement_json'], true),
        ],
        $participants,
    )), $stake, $matchId);
    $payload = [
        'stake' => $stake,
        'round' => (int)$room['round_no'],
        'seed' => $room['seed'],
        'players' => $results,
    ];
    save_match($pdo, $room, $participants, $results, $matchId, $stake, $now);
    $pdo->prepare('DELETE FROM game_room_players WHERE room_code = ? AND left_round = 1')->execute([$room['code']]);
    $players = zingplay_active_players($players);
    zingplay_set_phase($pdo, $room, 'revealing', zingplay_phase_seconds('revealing'), $now, [
        'results_json' => zingplay_json($payload),
        'finished_at' => gmdate('Y-m-d H:i:s', $now),
    ]);
    zingplay_fix_host($pdo, $room, $players, $now);
}

// Mọi người tham gia (còn trong phòng) đã nộp bài chưa?
function zingplay_all_submitted(array $players): bool
{
    $waiting = 0;
    foreach ($players as $player) {
        if ((int)$player['left_round'] === 0 && zingplay_is_participant($player)
            && $player['arrangement_json'] === null) {
            $waiting++;
        }
    }
    return $waiting === 0;
}

// Thực hiện đúng một bước chuyển phase (đã giữ khóa phòng và người chơi).
function zingplay_run_transition(PDO $pdo, array &$room, array &$players, int $now): bool
{
    switch ($room['phase']) {
        case 'waiting':
            if (count($players) >= 2) {
                zingplay_start_round($pdo, $room, $players, $now);
            } else {
                zingplay_update_room($pdo, $room, ['phase_deadline' => null], $now);
            }
            return true;
        case 'dealing':
            zingplay_set_phase($pdo, $room, 'arranging', zingplay_phase_seconds('arranging'), $now);
            return true;
        case 'arranging':
            zingplay_finish_round($pdo, $room, $players, $now);
            return true;
        case 'revealing':
            zingplay_set_phase($pdo, $room, 'scoring', zingplay_phase_seconds('scoring'), $now);
            return true;
        case 'scoring':
            zingplay_set_phase($pdo, $room, 'summary', zingplay_phase_seconds('summary'), $now);
            return true;
        case 'summary':
            if (count($players) < 2) {
                zingplay_reset_to_waiting($pdo, $room, $players, $now);
            } else {
                zingplay_set_phase($pdo, $room, 'next', zingplay_phase_seconds('next'), $now);
            }
            return true;
        case 'next':
            zingplay_start_round($pdo, $room, $players, $now);
            return true;
    }
    return false;
}

// Đến hạn thì chuyển phase. `$known` (nếu có) là hàng phòng đã đọc ở ngoài để khỏi truy vấn lại.
function zingplay_advance_if_due(PDO $pdo, string $code, ?array $known = null): bool
{
    $now = zingplay_now();
    if ($known === null) {
        $statement = $pdo->prepare('SELECT auto_play, phase, phase_deadline FROM game_rooms WHERE code = ?');
        $statement->execute([$code]);
        $known = $statement->fetch() ?: null;
    }
    if ($known === null || (int)$known['auto_play'] !== 1 || $known['phase_deadline'] === null
        || (int)$known['phase_deadline'] > $now) {
        return false;
    }
    return zingplay_transaction($pdo, static function () use ($pdo, $code, $now): bool {
        $room = zingplay_lock_room($pdo, $code);
        if ($room === null || (int)$room['auto_play'] !== 1 || $room['phase_deadline'] === null
            || (int)$room['phase_deadline'] > $now) {
            return false;
        }
        $players = zingplay_lock_players($pdo, $code);
        return zingplay_run_transition($pdo, $room, $players, $now);
    });
}

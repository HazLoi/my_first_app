<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/games.php';
require_once __DIR__ . '/../games/registry.php';

function room_game_definition(string $gameType): ?array
{
    static $catalog = null;
    $catalog ??= require __DIR__ . '/../config/games.php';
    foreach ($catalog as $game) {
        if ($game['id'] === $gameType) {
            return $game;
        }
    }
    return null;
}

function room_requested_game_type(mixed $value = null): string
{
    $gameType = $value ?? 'xapxam';
    if (!is_string($gameType)) {
        throw new ApiException(400, 'Loại game không hợp lệ.');
    }
    $game = room_game_definition($gameType);
    if ($game === null) {
        throw new ApiException(400, 'Loại game không hợp lệ.');
    }
    if (!$game['enabled']) {
        throw new ApiException(409, 'Game này chưa ra mắt.');
    }
    return $gameType;
}

function room_create_options(array $body): array
{
    $gameType = room_requested_game_type($body['game_type'] ?? null);
    $game = room_game_definition($gameType);
    $tienlenConfig = $gameType === 'tienlen' ? require __DIR__ . '/../games/tienlen/config.php' : null;
    $isPublic = $body['isPublic'] ?? false;
    if (!is_bool($isPublic)) {
        throw new ApiException(400, 'Chế độ phòng không hợp lệ.');
    }
    $stake = $body['stake'] ?? ZINGPLAY_STAKES[0];
    if (!is_int($stake) || !in_array($stake, ZINGPLAY_STAKES, true)) {
        throw new ApiException(400, 'Mức cược không hợp lệ.');
    }
    $autoPlay = $body['autoPlay'] ?? false;
    if (!is_bool($autoPlay)) {
        throw new ApiException(400, 'Chế độ chơi liên tục không hợp lệ.');
    }
    $maxPlayers = $body['maxPlayers'] ?? 4;
    if (!is_int($maxPlayers) || $maxPlayers < $game['minPlayers'] || $maxPlayers > $game['maxPlayers']) {
        throw new ApiException(400, 'Số người chơi tối đa không phù hợp với game.');
    }
    $password = $body['password'] ?? null;
    if ($password !== null && (!is_string($password) || $password === '' || strlen($password) > 32)) {
        throw new ApiException(400, 'Mật khẩu bàn cần từ 1 đến 32 ký tự.');
    }
    $scoringMode = $body['scoringMode'] ?? ($tienlenConfig['defaultScoringMode'] ?? 'coins');
    if (!in_array($scoringMode, ['points', 'coins'], true)) {
        throw new ApiException(400, 'Chế độ tính điểm không hợp lệ.');
    }
    $targetScore = $body['targetScore'] ?? ($tienlenConfig['defaultTargetScore'] ?? 20);
    $targetMin = $tienlenConfig['scoringBounds']['targetMin'] ?? 5;
    $targetMax = $tienlenConfig['scoringBounds']['targetMax'] ?? 200;
    if (!is_int($targetScore) || $targetScore < $targetMin || $targetScore > $targetMax) {
        throw new ApiException(400, 'Điểm đích phải nằm trong khoảng 5 đến 200.');
    }
    $scoringConfig = $body['scoringConfig'] ?? null;
    if ($scoringConfig !== null && !is_array($scoringConfig)) {
        throw new ApiException(400, 'Cấu hình tính điểm không hợp lệ.');
    }
    $scoringConfig = $gameType === 'tienlen'
        ? room_validate_scoring_config(is_array($scoringConfig) ? $scoringConfig : [])
        : [];
    return [
        'isPublic' => $isPublic,
        'gameType' => $gameType,
        'stake' => $stake,
        'autoPlay' => $autoPlay,
        'maxPlayers' => $maxPlayers,
        'passwordHash' => $password === null ? null : password_hash($password, PASSWORD_DEFAULT),
        'scoringMode' => $gameType === 'tienlen' ? $scoringMode : 'coins',
        'targetScore' => $gameType === 'tienlen' ? $targetScore : 0,
        'scoringConfig' => $gameType === 'tienlen' ? $scoringConfig : [],
    ];
}

function room_validate_scoring_config(array $input): array
{
    $defaults = require __DIR__ . '/../games/tienlen/config.php';
    $bounds = $defaults['scoringBounds'];
    $allowedKeys = ['rankPoints', 'chopValues', 'chopperGains', 'chopOverMode', 'coverShortfallByEarlierVictims', 'whiteEnabled', 'bonusPerOpponent', 'whiteTypes', 'coldEnabled', 'coldPenalty', 'rottenEnabled'];
    if (array_diff(array_keys($input), $allowedKeys) !== []) {
        throw new ApiException(400, 'Cấu hình tính điểm có trường không hợp lệ.');
    }
    $rankPoints = $input['rankPoints'] ?? $defaults['defaultRankPoints'];
    if (!is_array($rankPoints) || array_diff(array_keys($rankPoints), [2, 3, 4]) !== []) {
        throw new ApiException(400, 'Bảng điểm hạng không hợp lệ.');
    }
    $validatedRanks = [];
    foreach ([2, 3, 4] as $count) {
        $points = $rankPoints[$count] ?? $defaults['defaultRankPoints'][$count];
        if (!is_array($points) || count($points) !== $count
            || count(array_filter($points, 'is_int')) !== $count) {
            throw new ApiException(400, 'Bảng điểm hạng phải gồm đủ số người tương ứng.');
        }
        $validatedRanks[$count] = array_map('intval', array_values($points));
        foreach ($validatedRanks[$count] as $point) {
            if ($point < $bounds['pointMin'] || $point > $bounds['pointMax']) throw new ApiException(400, 'Điểm hạng nằm ngoài phạm vi cho phép.');
        }
    }
    $chopValues = $input['chopValues'] ?? $defaults['defaultChopValues'];
    if (!is_array($chopValues) || array_diff(array_keys($chopValues), ['black_two', 'red_two', 'four', 'pairs_run_3', 'pairs_run_4']) !== []) {
        throw new ApiException(400, 'Điểm phạt chặt không hợp lệ.');
    }
    $validatedChops = [];
    foreach (['black_two', 'red_two', 'four', 'pairs_run_3', 'pairs_run_4'] as $key) {
        $value = $chopValues[$key] ?? $defaults['defaultChopValues'][$key];
        if (!is_int($value) || $value < $bounds['penaltyMin'] || $value > $bounds['penaltyMax']) {
            throw new ApiException(400, 'Điểm phạt chặt không hợp lệ.');
        }
        $validatedChops[$key] = $value;
    }
    $chopperGains = $input['chopperGains'] ?? $defaults['chopperGains'];
    $chopOverMode = $input['chopOverMode'] ?? $defaults['chopOverMode'];
    if (!in_array($chopOverMode, ['last-pays-all', 'stack'], true)) {
        throw new ApiException(400, 'Chế độ chặt đè không hợp lệ.');
    }
    $coverShortfall = $input['coverShortfallByEarlierVictims'] ?? $defaults['coverShortfallByEarlierVictims'];
    $whiteEnabled = $input['whiteEnabled'] ?? $defaults['whiteEnabled'];
    $coldEnabled = $input['coldEnabled'] ?? $defaults['coldEnabled'];
    $rottenEnabled = $input['rottenEnabled'] ?? $defaults['rottenPointsEnabled'];
    $bonus = $input['bonusPerOpponent'] ?? $defaults['whiteBonusPerOpponent'];
    $coldPenalty = $input['coldPenalty'] ?? $defaults['coldPenalty'];
    foreach ([$chopperGains, $coverShortfall, $whiteEnabled, $coldEnabled, $rottenEnabled] as $flag) {
        if (!is_bool($flag)) throw new ApiException(400, 'Cờ cấu hình tính điểm phải là boolean.');
    }
    if (!is_int($bonus) || $bonus < $bounds['bonusMin'] || $bonus > $bounds['bonusMax']
        || !is_int($coldPenalty) || $coldPenalty < $bounds['penaltyMin'] || $coldPenalty > $bounds['penaltyMax']) {
        throw new ApiException(400, 'Điểm phạt/cộng tới trắng không hợp lệ.');
    }
    $whiteTypes = $input['whiteTypes'] ?? $defaults['whitePriority'];
    $knownWhiteTypes = ['dragon', 'four_twos', 'six_pairs', 'five_pairs_run', 'four_threes'];
    if (!is_array($whiteTypes)) {
        throw new ApiException(400, 'Danh sách tới trắng không hợp lệ.');
    }
    if (array_is_list($whiteTypes)) {
        if (count(array_filter($whiteTypes, 'is_string')) !== count($whiteTypes)
            || array_diff($whiteTypes, $knownWhiteTypes) !== []) {
            throw new ApiException(400, 'Danh sách tới trắng không hợp lệ.');
        }
        $typesEnabled = [];
        foreach ($knownWhiteTypes as $type) {
            $typesEnabled[$type] = in_array($type, $whiteTypes, true);
        }
    } else {
        if (array_diff(array_keys($whiteTypes), $knownWhiteTypes) !== []
            || count(array_filter($whiteTypes, 'is_bool')) !== count($whiteTypes)) {
            throw new ApiException(400, 'Danh sách tới trắng không hợp lệ.');
        }
        $typesEnabled = array_fill_keys($knownWhiteTypes, false);
        foreach ($whiteTypes as $type => $enabled) {
            $typesEnabled[$type] = $enabled;
        }
    }
    return [
        'rankPoints' => $validatedRanks,
        'chopValues' => $validatedChops,
        'chopperGains' => $chopperGains,
        'chopOverMode' => $chopOverMode,
        'coverShortfallByEarlierVictims' => $coverShortfall,
        'whiteEnabled' => $whiteEnabled,
        'bonusPerOpponent' => $bonus,
        'whiteTypes' => $typesEnabled,
        'coldEnabled' => $coldEnabled,
        'coldPenalty' => $coldPenalty,
        'rottenEnabled' => $rottenEnabled,
    ];
}

// Trong transaction, đã khóa dòng users của người tạo. Trả về mã phòng.
function room_create(PDO $pdo, array $user, array $options): string
{
    if (find_active_membership($pdo, $user['id'])) {
        throw new ApiException(409, 'Bạn đang ở trong một phòng.');
    }
    $now = zingplay_now();
    $code = make_room_code($pdo);
    $playerId = new_id();
    $pdo->prepare(
        "INSERT INTO game_rooms
          (code, host_player_id, status, is_public, stake, game_type, auto_play, max_players, password_hash,
           phase, phase_started_at, version, last_activity, scoring_mode, target_score, scoring_config)
         VALUES (?, ?, 'waiting', ?, ?, ?, ?, ?, ?, 'waiting', ?, 1, ?, ?, ?, ?)",
    )->execute([
        $code,
        $playerId,
        (int)$options['isPublic'],
        $options['stake'],
        $options['gameType'] ?? 'xapxam',
        (int)$options['autoPlay'],
        $options['maxPlayers'],
        $options['passwordHash'],
        $now,
        $now,
        $options['scoringMode'],
        $options['targetScore'],
        zingplay_json($options['scoringConfig']),
    ]);
    $pdo->prepare(
        'INSERT INTO game_room_players
          (player_id, room_code, user_id, seat_number, display_name, hand_json, last_seen)
         VALUES (?, ?, ?, 1, ?, ?, ?)',
    )->execute([$playerId, $code, $user['id'], $user['display_name'], '[]', $now]);
    return $code;
}

// Trong transaction, đã khóa users và đã kiểm tra chưa ở phòng nào. Mọi kiểm tra diễn ra trước khi ghi.
function room_join(PDO $pdo, array $user, string $code, mixed $password, ?string $gameType = null): void
{
    $now = zingplay_now();
    $room = zingplay_lock_room($pdo, $code);
    if (!$room) {
        throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
    }
    if ($gameType !== null && $room['game_type'] !== $gameType) {
        throw new ApiException(409, 'Bàn này thuộc game khác.');
    }
    $auto = (int)$room['auto_play'] === 1;
    if (!in_array($room['status'], $auto ? ['waiting', 'playing'] : ['waiting'], true)) {
        throw new ApiException(409, 'Ván đã bắt đầu; không thể vào phòng lúc này.');
    }
    if ($room['password_hash'] !== null
        && (!is_string($password) || !password_verify($password, $room['password_hash']))) {
        throw new ApiException(403, 'Sai mật khẩu bàn.');
    }
    if (($room['game_type'] !== 'tienlen') || (($room['scoring_mode'] ?? 'coins') !== 'points')) {
        require_stake_balance((int)$user['balance'], (int)$room['stake']);
    }
    $players = zingplay_lock_players($pdo, $code);
    $maxPlayers = (int)$room['max_players'];
    $ghost = null;
    foreach ($players as $player) {
        if ($player['user_id'] !== $user['id']) {
            continue;
        }
        if ((int)$player['left_round'] === 0) {
            throw new ApiException(409, 'Tài khoản này đã có trong phòng.');
        }
        $ghost = $player;
    }
    if ($ghost !== null && in_array($room['phase'], ['dealing', 'arranging', 'playing'], true)) {
        throw new ApiException(409, 'Bạn vừa rời ván đang diễn ra; hãy đợi ván này kết thúc rồi vào lại.');
    }
    $activeCount = count(zingplay_active_players($players));
    if ($activeCount >= $maxPlayers) {
        throw new ApiException(409, 'Phòng đã đủ ' . $maxPlayers . ' người chơi.');
    }
    if ($ghost !== null) {
        $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$ghost['player_id']]);
        $players = array_values(array_filter(
            $players,
            static fn(array $player): bool => $player['player_id'] !== $ghost['player_id'],
        ));
    }
    $occupiedSeats = array_map(static fn(array $player): int => (int)$player['seat_number'], $players);
    $seat = 1;
    while (in_array($seat, $occupiedSeats, true)) {
        $seat++;
    }
    $playerId = new_id();
    $pdo->prepare(
        'INSERT INTO game_room_players
          (player_id, room_code, user_id, seat_number, display_name, hand_json, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
    )->execute([$playerId, $code, $user['id'], $seat, $user['display_name'], '[]', $now]);
    $fields = [];
    if ($activeCount === 0) {
        $fields['host_player_id'] = $playerId;
    }
    if ($auto && $room['phase'] === 'waiting' && $activeCount + 1 >= $maxPlayers) {
        $seconds = $room['game_type'] === 'tienlen'
            ? (require __DIR__ . '/../games/tienlen/config.php')['autoStartSeconds']
            : zingplay_phase_seconds('auto_start');
        $fields = ['phase_deadline' => $now + $seconds];
    }
    zingplay_update_room($pdo, $room, $fields + ['empty_since' => null], $now);
}

function room_leave_auto(PDO $pdo, array &$room, array &$players, int $selfIndex, int $now): void
{
    $self = $players[$selfIndex];
    if (in_array($room['phase'], ['dealing', 'arranging'], true) && zingplay_is_participant($self)) {
        // Rời giữa ván: người "ma" vẫn được tự xếp bài và thanh toán thắng/thua cho đến hết ván.
        $pdo->prepare('UPDATE game_room_players SET left_round = 1 WHERE player_id = ?')->execute([$self['player_id']]);
        $players[$selfIndex]['left_round'] = 1;
        $remaining = array_filter(zingplay_active_players($players), 'zingplay_is_participant');
        if (count($remaining) < 2) {
            zingplay_cancel_round(
                $pdo,
                $room,
                $players,
                $now,
                $self['display_name'] . ' đã rời phòng nên ván bị hủy, xu không thay đổi.',
            );
            return;
        }
        zingplay_fix_host($pdo, $room, $players, $now);
        if ($room['phase'] === 'arranging' && zingplay_all_submitted($players)) {
            zingplay_finish_round($pdo, $room, $players, $now);
        } else {
            zingplay_update_room($pdo, $room, [], $now);
        }
        return;
    }
    $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$self['player_id']]);
    array_splice($players, $selfIndex, 1);
    $active = zingplay_active_players($players);
    if ($active === []) {
        zingplay_mark_room_empty($pdo, $room, $now);
        return;
    }
    zingplay_fix_host($pdo, $room, $players, $now);
    $fields = [];
    if ($room['phase'] === 'waiting' && count($active) < (int)$room['max_players']) {
        $fields = ['phase_deadline' => null];
    }
    zingplay_update_room($pdo, $room, $fields, $now);
}

function room_leave_stale(PDO $pdo, array &$room, array &$players, int $selfIndex, int $now): void
{
    $departed = $players[$selfIndex];
    if ($room['status'] === 'playing') {
        zingplay_update_room($pdo, $room, [
            'status' => 'cancelled',
            'cancel_message' => $departed['display_name'] . ' đã mất kết nối. Ván bị hủy.',
            'finished_at' => gmdate('Y-m-d H:i:s', $now),
        ], $now);
    }
    $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$departed['player_id']]);
    array_splice($players, $selfIndex, 1);
    if (zingplay_active_players($players) === []) {
        zingplay_mark_room_empty($pdo, $room, $now);
        return;
    }
    zingplay_fix_host($pdo, $room, $players, $now);
    if (($room['empty_since'] ?? null) !== null) {
        zingplay_update_room($pdo, $room, ['empty_since' => null], $now);
    }
}

// Đọc nhẹ trạng thái phòng cho poll: kiểm tra thành viên, đến hạn thì chuyển phase, cập nhật last_seen.
function room_poll_version(PDO $pdo, array $user, string $code, ?string $gameType = null): int
{
    $now = zingplay_now();
    $statement = $pdo->prepare('SELECT auto_play, phase, phase_deadline, version, game_type FROM game_rooms WHERE code = ?');
    $statement->execute([$code]);
    $room = $statement->fetch();
    if (!$room) {
        throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
    }
    if ($gameType !== null && $room['game_type'] !== $gameType) {
        throw new ApiException(409, 'Bàn này thuộc game khác.');
    }
    $member = $pdo->prepare(
        'SELECT player_id, last_seen, left_round FROM game_room_players WHERE room_code = ? AND user_id = ?',
    );
    $member->execute([$code, $user['id']]);
    $self = $member->fetch();
    if (!$self || (int)$self['left_round'] === 1) {
        if (!$self && $room['game_type'] === 'tienlen') {
            $stateStatement = $pdo->prepare('SELECT game_state FROM game_rooms WHERE code = ?');
            $stateStatement->execute([$code]);
            $stateJson = $stateStatement->fetchColumn();
            $state = $stateJson ? json_decode($stateJson, true, 512, JSON_THROW_ON_ERROR) : [];
            if (in_array($user['id'], $state['removedUsers'] ?? [], true)) {
                throw new ApiException(409, 'Bạn đã hết xu và được đưa về sảnh.');
            }
        }
        throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
    }
    $pdo->prepare('UPDATE game_room_players SET last_seen = ? WHERE player_id = ?')
        ->execute([$now, $self['player_id']]);
    $advanced = $room['game_type'] === 'tienlen'
        ? (new TienLenEngine())->advanceIfDue($pdo, $room + ['code' => $code])
        : zingplay_advance_if_due($pdo, $code, $room);
    if ($advanced) {
        $statement->execute([$code]);
        $room = $statement->fetch() ?: $room;
        if ($room['game_type'] === 'tienlen') {
            $member->execute([$code, $user['id']]);
            if (!$member->fetch() && user_balance($pdo, $user['id']) <= 0) {
                throw new ApiException(409, 'Bạn đã hết xu và được đưa về sảnh.');
            }
        }
    }
    return (int)$room['version'];
}

function room_chat_messages(PDO $pdo, string $code, string $userId, int $sinceId): array
{
    $member = $pdo->prepare(
        'SELECT 1 FROM game_room_players WHERE room_code = ? AND user_id = ? AND left_round = 0',
    );
    $member->execute([$code, $userId]);
    if (!$member->fetchColumn()) {
        throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
    }
    $statement = $pdo->prepare(
        'SELECT id, user_id, display_name, text, created_at FROM table_chat
          WHERE table_id = ? AND id > ? ORDER BY id LIMIT 50',
    );
    $statement->execute([$code, $sinceId]);
    return array_map(static fn(array $message): array => [
        'id' => (int)$message['id'],
        'userId' => $message['user_id'],
        'displayName' => $message['display_name'],
        'text' => $message['text'],
        'createdAt' => (int)$message['created_at'] * 1000,
    ], $statement->fetchAll());
}

function room_chat_send(PDO $pdo, array $user, string $code, array $body): array
{
    $rawText = $body['text'] ?? null;
    if (!is_string($rawText)) {
        throw new ApiException(400, 'Tin nhắn không hợp lệ.');
    }
    $text = trim(strip_tags($rawText));
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text) ?? '';
    $characters = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);
    if (is_array($characters) && count($characters) > 200) {
        $text = implode('', array_slice($characters, 0, 200));
    }
    if ($text === '') {
        throw new ApiException(400, 'Tin nhắn không được để trống.');
    }
    return zingplay_transaction($pdo, static function () use ($pdo, $user, $code, $text): array {
        $pdo->exec('DELETE FROM table_chat WHERE table_id NOT IN (SELECT code FROM game_rooms)');
        $room = zingplay_lock_room($pdo, $code);
        if ($room === null) {
            throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
        }
        $member = $pdo->prepare(
            'SELECT player_id, display_name FROM game_room_players
              WHERE room_code = ? AND user_id = ? AND left_round = 0' . lock_clause($pdo),
        );
        $member->execute([$code, $user['id']]);
        $player = $member->fetch();
        if (!$player) {
            throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
        }
        $latest = $pdo->prepare('SELECT created_at FROM table_chat WHERE table_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1');
        $latest->execute([$code, $user['id']]);
        $lastSent = $latest->fetchColumn();
        $now = zingplay_now();
        if ($lastSent !== false && $now - (int)$lastSent < 1) {
            throw new ApiException(429, 'Bạn gửi tin nhắn quá nhanh.');
        }
        $pdo->prepare(
            'INSERT INTO table_chat (table_id, user_id, display_name, text, created_at) VALUES (?, ?, ?, ?, ?)',
        )->execute([$code, $user['id'], $player['display_name'], $text, $now]);
        $id = (int)$pdo->lastInsertId();
        $overflow = $pdo->prepare('SELECT id FROM table_chat WHERE table_id = ? ORDER BY id DESC LIMIT 50');
        $overflow->execute([$code]);
        $retainedIds = $overflow->fetchAll(PDO::FETCH_COLUMN);
        if (count($retainedIds) === 50) {
            $pdo->prepare('DELETE FROM table_chat WHERE table_id = ? AND id < ?')
                ->execute([$code, min(array_map('intval', $retainedIds))]);
        }
        $pdo->prepare('UPDATE game_rooms SET version = version + 1, last_activity = ? WHERE code = ?')
            ->execute([$now, $code]);
        return [
            'id' => $id,
            'userId' => $user['id'],
            'displayName' => $player['display_name'],
            'text' => $text,
            'createdAt' => $now * 1000,
        ];
    });
}

function handle_room_routes(string $route, string $method, PDO $pdo): void
{
    if ($route === '/rooms/current' && $method === 'GET') {
        $user = require_user($pdo);
        $membership = find_active_membership($pdo, $user['id']);
        respond(200, ['code' => $membership['room_code'] ?? null, 'gameType' => $membership['game_type'] ?? null]);
    }

    if ($route === '/rooms' && $method === 'GET') {
        require_user($pdo);
        $gameType = room_requested_game_type($_GET['game_type'] ?? null);
        $statement = $pdo->prepare(
            "SELECT r.code, r.stake, r.max_players, r.phase, r.status, r.auto_play, r.round_no, r.scoring_mode,
                    (r.password_hash IS NOT NULL) AS has_password, host.display_name AS host_name,
                    (SELECT COUNT(*) FROM game_room_players p
                      WHERE p.room_code = r.code AND p.left_round = 0) AS player_count
               FROM game_rooms r
               JOIN game_room_players host ON host.player_id = r.host_player_id
              WHERE r.game_type = ? AND r.is_public = 1
                AND (r.status = 'waiting' OR (r.status = 'playing' AND r.auto_play = 1))
                AND (SELECT COUNT(*) FROM game_room_players active
                      WHERE active.room_code = r.code AND active.left_round = 0) > 0
              ORDER BY r.created_at DESC, r.code
              LIMIT 200",
        );
        $statement->execute([$gameType]);
        $rooms = $statement->fetchAll();
        respond(200, ['rooms' => array_map(static fn(array $room): array => [
            'code' => $room['code'],
            'hostName' => $room['host_name'],
            'playerCount' => (int)$room['player_count'],
            'stake' => (int)$room['stake'],
            'maxPlayers' => (int)$room['max_players'],
            'hasPassword' => (int)$room['has_password'] === 1,
            'phase' => (int)$room['auto_play'] === 1
                ? $room['phase']
                : (['waiting' => 'waiting', 'playing' => 'arranging', 'finished' => 'summary'][$room['status']] ?? 'waiting'),
            'autoPlay' => (int)$room['auto_play'] === 1,
            'round' => (int)$room['round_no'],
        ] + ($gameType === 'tienlen' ? ['scoringMode' => $room['scoring_mode']] : []), array_slice($rooms, 0, 100))]);
    }

    if ($route === '/rooms' && $method === 'POST') {
        $user = require_user($pdo);
        $options = room_create_options(json_body());
        $user['autoTopupAmount'] = ensureMinCoins($pdo, $user['id']);
        $user['balance'] = user_balance($pdo, $user['id']);
        if ($options['gameType'] !== 'tienlen' || $options['scoringMode'] !== 'points') {
            require_stake_balance((int)$user['balance'], $options['stake']);
        }
        $code = zingplay_transaction($pdo, static function () use ($pdo, $user, $options): string {
            $lockUser = $pdo->prepare('SELECT id FROM users WHERE id = ?' . lock_clause($pdo));
            $lockUser->execute([$user['id']]);
            return room_create($pdo, $user, $options);
        });
        respond(201, room_snapshot($pdo, $user, $code));
    }

    if ($route === '/rooms/quick' && $method === 'POST') {
        $user = require_user($pdo);
        $body = json_body_optional();
        $gameType = room_requested_game_type($body['game_type'] ?? null);
        $tienlenConfig = $gameType === 'tienlen'
            ? require __DIR__ . '/../games/tienlen/config.php' : null;
        $stake = $body['stake'] ?? null;
        if ($stake !== null && (!is_int($stake) || !in_array($stake, ZINGPLAY_STAKES, true))) {
            throw new ApiException(400, 'Mức cược không hợp lệ.');
        }
        $user['autoTopupAmount'] = ensureMinCoins($pdo, $user['id']);
        $user['balance'] = user_balance($pdo, $user['id']);
        if ($stake === null) {
            foreach (ZINGPLAY_STAKES as $candidate) {
                if ((int)$user['balance'] >= zingplayMinBalance($candidate)) {
                    $stake = $candidate;
                    break;
                }
            }
            if ($stake === null && $gameType === 'tienlen') {
                $stake = ZINGPLAY_STAKES[0];
            }
        }
        if ($gameType !== 'tienlen') {
            require_stake_balance((int)$user['balance'], $stake ?? ZINGPLAY_STAKES[0]);
        }
        [$code, $created] = zingplay_transaction($pdo, static function () use ($pdo, $user, $stake, $gameType, $tienlenConfig): array {
            $lockUser = $pdo->prepare('SELECT id FROM users WHERE id = ?' . lock_clause($pdo));
            $lockUser->execute([$user['id']]);
            if (find_active_membership($pdo, $user['id'])) {
                throw new ApiException(409, 'Bạn đang ở trong một phòng.');
            }
            // Ưu tiên phòng đông nhất còn chỗ.
            $candidates = $pdo->prepare(
                "SELECT r.code, r.max_players,
                        (SELECT COUNT(*) FROM game_room_players p
                          WHERE p.room_code = r.code AND p.left_round = 0) AS player_count
                   FROM game_rooms r
                  WHERE r.game_type = ? AND r.auto_play = 1 AND r.is_public = 1 AND r.password_hash IS NULL AND r.stake = ?
                    AND (r.game_type <> 'tienlen' OR r.scoring_mode = 'points')
                    AND (r.status = 'waiting' OR (r.status = 'playing' AND r.game_type = 'xapxam'))
                  ORDER BY player_count DESC, r.created_at, r.code
                  LIMIT 50",
            );
            $candidates->execute([$gameType, $stake]);
            foreach ($candidates->fetchAll() as $candidate) {
                if ((int)$candidate['player_count'] >= (int)$candidate['max_players']) {
                    continue;
                }
                try {
                    room_join($pdo, $user, $candidate['code'], null, $gameType);
                    return [$candidate['code'], false];
                } catch (ApiException) {
                    continue;
                }
            }
            return [room_create($pdo, $user, [
                'isPublic' => true,
                'gameType' => $gameType,
                'stake' => $stake,
                'autoPlay' => true,
                'maxPlayers' => 4,
                'passwordHash' => null,
                'scoringMode' => $tienlenConfig['defaultScoringMode'] ?? 'coins',
                'targetScore' => $tienlenConfig['defaultTargetScore'] ?? 0,
                'scoringConfig' => $gameType === 'tienlen' ? room_validate_scoring_config([]) : [],
            ]), true];
        });
        respond($created ? 201 : 200, room_snapshot($pdo, $user, $code));
    }

    if ($route === '/rooms/join' && $method === 'POST') {
        $user = require_user($pdo);
        $body = json_body();
        $rawCode = $body['code'] ?? null;
        $code = is_string($rawCode) ? strtoupper(trim($rawCode)) : '';
        if (preg_match('/^[A-Z2-9]{5}$/', $code) !== 1) {
            throw new ApiException(400, 'Mã phòng cần có 5 ký tự.');
        }
        $user['autoTopupAmount'] = ensureMinCoins($pdo, $user['id']);
        $user['balance'] = user_balance($pdo, $user['id']);
        $password = $body['password'] ?? null;
        $gameType = array_key_exists('game_type', $body)
            ? room_requested_game_type($body['game_type'])
            : null;
        zingplay_transaction($pdo, static function () use ($pdo, $user, $code, $password, $gameType): void {
            $lockUser = $pdo->prepare('SELECT id FROM users WHERE id = ?' . lock_clause($pdo));
            $lockUser->execute([$user['id']]);
            if (find_active_membership($pdo, $user['id'])) {
                throw new ApiException(409, 'Bạn đang ở trong một phòng.');
            }
            room_join($pdo, $user, $code, $password, $gameType);
        });
        respond(200, room_snapshot($pdo, $user, $code));
    }

    if (preg_match('~^/rooms/([A-Z2-9]{5})$~', $route, $matches) === 1 && $method === 'GET') {
        $user = require_user($pdo);
        $code = $matches[1];
        $gameType = array_key_exists('game_type', $_GET)
            ? room_requested_game_type($_GET['game_type'])
            : null;
        $sinceRaw = $_GET['since_version'] ?? null;
        $since = null;
        if ($sinceRaw !== null) {
            $since = filter_var($sinceRaw, FILTER_VALIDATE_INT);
            if ($since === false || $since < 0) {
                throw new ApiException(400, 'since_version cần là số nguyên không âm.');
            }
        }
        $wait = $since !== null && ($_GET['wait'] ?? '') === '1' && zingplay_long_poll_enabled();
        $chatSinceId = filter_var($_GET['chat_since_id'] ?? '0', FILTER_VALIDATE_INT);
        if ($chatSinceId === false || $chatSinceId < 0) {
            throw new ApiException(400, 'chat_since_id cần là số nguyên không âm.');
        }
        $deadline = microtime(true) + ZINGPLAY_LONG_POLL_SECONDS;
        while (true) {
            $version = room_poll_version($pdo, $user, $code, $gameType);
            if ($since === null || $version !== $since) {
                $snapshot = room_snapshot($pdo, $user, $code);
                $snapshot['chatMessages'] = room_chat_messages($pdo, $code, $user['id'], (int)$chatSinceId);
                respond(200, $snapshot);
            }
            if (!$wait || microtime(true) >= $deadline) {
                respond(200, ['changed' => false, 'version' => $version, 'serverTime' => zingplay_now_ms()]);
            }
            usleep(ZINGPLAY_LONG_POLL_STEP_MICROSECONDS);
        }
    }

    if (preg_match('~^/rooms/([A-Z2-9]{5})/chat$~', $route, $matches) === 1 && $method === 'POST') {
        $user = require_user($pdo);
        $message = room_chat_send($pdo, $user, $matches[1], json_body());
        respond(201, ['message' => $message]);
    }

    if (preg_match('~^/rooms/([A-Z2-9]{5})/(start|submit|action|leave)$~', $route, $matches) === 1
        && $method === 'POST') {
        $user = require_user($pdo);
        $code = $matches[1];
        $action = $matches[2];
        $body = in_array($action, ['submit', 'action'], true) ? json_body() : [];
        if (in_array($action, ['start', 'action'], true)) {
            $user['autoTopupAmount'] = ensureMinCoins($pdo, $user['id']);
            $user['balance'] = user_balance($pdo, $user['id']);
        }
        if ($action === 'action') {
            $known = $pdo->prepare('SELECT code, game_type, phase_deadline FROM game_rooms WHERE code = ?');
            $known->execute([$code]);
            $knownRoom = $known->fetch();
            if ($knownRoom && $knownRoom['game_type'] === 'tienlen') {
                (new TienLenEngine())->advanceIfDue($pdo, $knownRoom);
            }
        }
        $outcome = zingplay_transaction($pdo, static function () use ($pdo, $user, $code, $action, $body): array {
            $now = zingplay_now();
            $room = zingplay_lock_room($pdo, $code);
            if (!$room) {
                throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
            }
            $players = zingplay_lock_players($pdo, $code);
            $selfIndex = null;
            $isGhost = false;
            foreach ($players as $index => $player) {
                if ($player['user_id'] === $user['id']) {
                    $selfIndex = $index;
                    $isGhost = (int)$player['left_round'] === 1;
                    break;
                }
            }
            if ($selfIndex === null || ($isGhost && $action !== 'leave')) {
                throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
            }
            if ($isGhost) {
                return ['cancelled' => false];
            }
            $auto = (int)$room['auto_play'] === 1;

            if ($room['game_type'] === 'tienlen') {
                $engine = new TienLenEngine();
                if ($action === 'start') {
                    $isWaitingStart = $room['status'] === 'waiting';
                    $isNewMatch = $room['status'] === 'playing'
                        && $room['phase'] === 'summary'
                        && ($room['scoring_mode'] ?? 'coins') === 'points'
                        && (json_decode((string)$room['game_state'], true)['matchEnded'] ?? false);
                    if ($room['host_player_id'] !== $players[$selfIndex]['player_id']
                        || (!$isWaitingStart && !$isNewMatch)) {
                        throw new ApiException(409, 'Chỉ chủ bàn mới có thể bắt đầu ván hoặc trận mới.');
                    }
                    if (count(zingplay_active_players($players)) < 2) {
                        throw new ApiException(409, 'Cần ít nhất 2 người để bắt đầu.');
                    }
                    $engine->startRound($pdo, $room, $players, $now);
                } elseif ($action === 'action') {
                    $engine->applyAction($pdo, $room, $players, $user, $body, $now);
                } elseif ($action === 'leave') {
                    $engine->leave($pdo, $room, $players, $selfIndex, $now);
                } else {
                    throw new ApiException(400, 'Hành động không hợp lệ.');
                }
                return ['cancelled' => false];
            }
            if ($action === 'action') {
                throw new ApiException(400, 'Hành động không hợp lệ.');
            }
            if ($action === 'start') {
                if ($room['status'] !== 'waiting') {
                    throw new ApiException(409, 'Ván này đã bắt đầu.');
                }
                if ($room['host_player_id'] !== $players[$selfIndex]['player_id']) {
                    throw new ApiException(403, 'Chỉ chủ phòng mới có thể chia bài.');
                }
                if (count($players) < 2) {
                    throw new ApiException(409, 'Cần ít nhất 2 người để bắt đầu.');
                }
                if ($auto) {
                    zingplay_start_round($pdo, $room, $players, $now);
                } else {
                    $balanceStatement = $pdo->prepare('SELECT balance FROM users WHERE id = ?' . lock_clause($pdo));
                    foreach ($players as $player) {
                        $balanceStatement->execute([$player['user_id']]);
                        if ((int)$balanceStatement->fetchColumn() < zingplayMinBalance((int)$room['stake'])) {
                            throw new ApiException(
                                409,
                                $player['display_name'] . ' không đủ xu cho mức cược ' . $room['stake'] . ' xu/điểm.',
                            );
                        }
                    }
                    $seed = zingplay_next_seed();
                    $deck = zingplayShuffleWithSeed($seed);
                    $updatePlayer = $pdo->prepare('UPDATE game_room_players SET hand_json = ? WHERE player_id = ?');
                    foreach ($players as $index => $player) {
                        $hand = array_slice($deck, $index * 13, 13);
                        $players[$index]['hand_json'] = zingplay_json($hand);
                        $players[$index]['arrangement_json'] = null;
                        $updatePlayer->execute([$players[$index]['hand_json'], $player['player_id']]);
                    }
                    zingplay_update_room($pdo, $room, [
                        'status' => 'playing',
                        'started_at' => gmdate('Y-m-d H:i:s', $now),
                        'seed' => $seed,
                        'round_no' => (int)$room['round_no'] + 1,
                    ], $now);
                }
            } elseif ($action === 'submit') {
                if ($room['status'] !== 'playing') {
                    throw new ApiException(409, 'Hiện không có ván bài đang diễn ra.');
                }
                if ($auto && $room['phase'] !== 'arranging') {
                    throw new ApiException(409, 'Chưa đến lúc xếp bài; hãy đợi chia bài xong.');
                }
                if (!zingplay_is_participant($players[$selfIndex])) {
                    throw new ApiException(409, 'Bạn đang xem ván này; hãy đợi ván sau.');
                }
                if ($players[$selfIndex]['arrangement_json'] !== null) {
                    throw new ApiException(409, 'Bạn đã chốt bài rồi.');
                }
                $hand = decode_json($players[$selfIndex]['hand_json']);
                $validation = zingplayValidateArrangement($hand, $body['arrangement'] ?? null);
                if (!$validation['valid']) {
                    throw new ApiException(400, $validation['message']);
                }
                $arrangementJson = zingplay_json($validation['hands']);
                $pdo->prepare('UPDATE game_room_players SET arrangement_json = ? WHERE player_id = ?')
                    ->execute([$arrangementJson, $players[$selfIndex]['player_id']]);
                $players[$selfIndex]['arrangement_json'] = $arrangementJson;
                if ($auto) {
                    if (zingplay_all_submitted($players)) {
                        zingplay_finish_round($pdo, $room, $players, $now);
                    } else {
                        zingplay_update_room($pdo, $room, [], $now);
                    }
                } else {
                    $allSubmitted = count(array_filter(
                        $players,
                        static fn(array $player): bool => $player['arrangement_json'] !== null,
                    )) === count($players);
                    if ($allSubmitted) {
                        $stake = (int)$room['stake'];
                        $matchId = new_id();
                        $results = settle_match_chips($pdo, $players, zingplayCompareResults(array_map(
                            static fn(array $player): array => [
                                'id' => $player['player_id'],
                                'name' => $player['display_name'],
                                'hands' => decode_json($player['arrangement_json']),
                            ],
                            $players,
                        )), $stake, $matchId);
                        $payload = [
                            'stake' => $stake,
                            'round' => (int)$room['round_no'],
                            'seed' => $room['seed'],
                            'players' => $results,
                        ];
                        zingplay_update_room($pdo, $room, [
                            'status' => 'finished',
                            'finished_at' => gmdate('Y-m-d H:i:s', $now),
                            'results_json' => zingplay_json($payload),
                        ], $now);
                        save_match($pdo, $room, $players, $results, $matchId, $stake, $now);
                    } else {
                        zingplay_update_room($pdo, $room, [], $now);
                    }
                }
            } else {
                if ($auto) {
                    room_leave_auto($pdo, $room, $players, $selfIndex, $now);
                } elseif ($room['status'] === 'playing') {
                    zingplay_update_room($pdo, $room, [
                        'status' => 'cancelled',
                        'cancel_message' => $players[$selfIndex]['display_name']
                            . ' đã rời phòng. Ván bị hủy; hãy tạo phòng mới.',
                        'finished_at' => gmdate('Y-m-d H:i:s', $now),
                    ], $now);
                } else {
                    $departedPlayerId = $players[$selfIndex]['player_id'];
                    $pdo->prepare('DELETE FROM game_room_players WHERE player_id = ?')->execute([$departedPlayerId]);
                    array_splice($players, $selfIndex, 1);
                    if ($players === []) {
                        zingplay_mark_room_empty($pdo, $room, $now);
                    } elseif ($room['status'] === 'waiting' && $room['host_player_id'] === $departedPlayerId) {
                        zingplay_update_room($pdo, $room, ['host_player_id' => $players[0]['player_id']], $now);
                    } else {
                        zingplay_update_room($pdo, $room, [], $now);
                    }
                }
            }
            return ['cancelled' => $room['status'] === 'cancelled'];
        });
        if ($action === 'leave') {
            respond(200, ['status' => 'ok', 'cancelled' => $outcome['cancelled']]);
        }
        respond(200, room_snapshot($pdo, $user, $code));
    }

}

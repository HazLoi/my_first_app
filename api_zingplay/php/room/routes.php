<?php
declare(strict_types=1);

function room_create_options(array $body): array
{
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
    if (!is_int($maxPlayers) || $maxPlayers < 2 || $maxPlayers > 4) {
        throw new ApiException(400, 'Số người chơi tối đa phải từ 2 đến 4.');
    }
    $password = $body['password'] ?? null;
    if ($password !== null && (!is_string($password) || $password === '' || strlen($password) > 32)) {
        throw new ApiException(400, 'Mật khẩu bàn cần từ 1 đến 32 ký tự.');
    }
    return [
        'isPublic' => $isPublic,
        'stake' => $stake,
        'autoPlay' => $autoPlay,
        'maxPlayers' => $maxPlayers,
        'passwordHash' => $password === null ? null : password_hash($password, PASSWORD_DEFAULT),
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
          (code, host_player_id, status, is_public, stake, auto_play, max_players, password_hash,
           phase, phase_started_at, version, last_activity)
         VALUES (?, ?, 'waiting', ?, ?, ?, ?, ?, 'waiting', ?, 1, ?)",
    )->execute([
        $code,
        $playerId,
        (int)$options['isPublic'],
        $options['stake'],
        (int)$options['autoPlay'],
        $options['maxPlayers'],
        $options['passwordHash'],
        $now,
        $now,
    ]);
    $pdo->prepare(
        'INSERT INTO game_room_players
          (player_id, room_code, user_id, seat_number, display_name, hand_json, last_seen)
         VALUES (?, ?, ?, 1, ?, ?, ?)',
    )->execute([$playerId, $code, $user['id'], $user['display_name'], '[]', $now]);
    return $code;
}

// Trong transaction, đã khóa users và đã kiểm tra chưa ở phòng nào. Mọi kiểm tra diễn ra trước khi ghi.
function room_join(PDO $pdo, array $user, string $code, mixed $password): void
{
    $now = zingplay_now();
    $room = zingplay_lock_room($pdo, $code);
    if (!$room) {
        throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
    }
    $auto = (int)$room['auto_play'] === 1;
    if (!in_array($room['status'], $auto ? ['waiting', 'playing'] : ['waiting'], true)) {
        throw new ApiException(409, 'Ván đã bắt đầu; không thể vào phòng lúc này.');
    }
    if ($room['password_hash'] !== null
        && (!is_string($password) || !password_verify($password, $room['password_hash']))) {
        throw new ApiException(403, 'Sai mật khẩu bàn.');
    }
    require_stake_balance((int)$user['balance'], (int)$room['stake']);
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
    if ($ghost !== null && in_array($room['phase'], ['dealing', 'arranging'], true)) {
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
    $pdo->prepare(
        'INSERT INTO game_room_players
          (player_id, room_code, user_id, seat_number, display_name, hand_json, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
    )->execute([new_id(), $code, $user['id'], $seat, $user['display_name'], '[]', $now]);
    $fields = [];
    if ($auto && $room['phase'] === 'waiting' && $activeCount + 1 >= $maxPlayers) {
        $fields = ['phase_deadline' => $now + zingplay_phase_seconds('auto_start')];
    }
    zingplay_update_room($pdo, $room, $fields, $now);
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
        zingplay_delete_room($pdo, $room);
        return;
    }
    zingplay_fix_host($pdo, $room, $players, $now);
    $fields = [];
    if ($room['phase'] === 'waiting' && count($active) < (int)$room['max_players']) {
        $fields = ['phase_deadline' => null];
    }
    zingplay_update_room($pdo, $room, $fields, $now);
}

// Đọc nhẹ trạng thái phòng cho poll: kiểm tra thành viên, đến hạn thì chuyển phase, cập nhật last_seen.
function room_poll_version(PDO $pdo, array $user, string $code): int
{
    $now = zingplay_now();
    $statement = $pdo->prepare('SELECT auto_play, phase, phase_deadline, version FROM game_rooms WHERE code = ?');
    $statement->execute([$code]);
    $room = $statement->fetch();
    if (!$room) {
        throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
    }
    $member = $pdo->prepare(
        'SELECT player_id, last_seen, left_round FROM game_room_players WHERE room_code = ? AND user_id = ?',
    );
    $member->execute([$code, $user['id']]);
    $self = $member->fetch();
    if (!$self || (int)$self['left_round'] === 1) {
        throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
    }
    if ($now - (int)$self['last_seen'] >= ZINGPLAY_SEEN_INTERVAL) {
        $pdo->prepare('UPDATE game_room_players SET last_seen = ? WHERE player_id = ?')
            ->execute([$now, $self['player_id']]);
    }
    if (zingplay_advance_if_due($pdo, $code, $room)) {
        $statement->execute([$code]);
        $room = $statement->fetch() ?: $room;
    }
    return (int)$room['version'];
}

function handle_room_routes(string $route, string $method, PDO $pdo): void
{
    if ($route === '/rooms' && $method === 'GET') {
        require_user($pdo);
        $rooms = $pdo->query(
            "SELECT r.code, r.stake, r.max_players, r.phase, r.auto_play, r.round_no,
                    (r.password_hash IS NOT NULL) AS has_password, host.display_name AS host_name,
                    (SELECT COUNT(*) FROM game_room_players p
                      WHERE p.room_code = r.code AND p.left_round = 0) AS player_count
               FROM game_rooms r
               JOIN game_room_players host ON host.player_id = r.host_player_id
              WHERE r.is_public = 1 AND (r.status = 'waiting' OR (r.status = 'playing' AND r.auto_play = 1))
              ORDER BY r.created_at DESC, r.code
              LIMIT 200",
        )->fetchAll();
        $rooms = array_values(array_filter(
            $rooms,
            static fn(array $room): bool => (int)$room['player_count'] < (int)$room['max_players'],
        ));
        respond(200, ['rooms' => array_map(static fn(array $room): array => [
            'code' => $room['code'],
            'hostName' => $room['host_name'],
            'playerCount' => (int)$room['player_count'],
            'stake' => (int)$room['stake'],
            'maxPlayers' => (int)$room['max_players'],
            'hasPassword' => (int)$room['has_password'] === 1,
            'phase' => (int)$room['auto_play'] === 1 ? $room['phase'] : 'waiting',
            'autoPlay' => (int)$room['auto_play'] === 1,
            'round' => (int)$room['round_no'],
        ], array_slice($rooms, 0, 100))]);
    }

    if ($route === '/rooms' && $method === 'POST') {
        $user = require_user($pdo);
        $options = room_create_options(json_body());
        require_stake_balance((int)$user['balance'], $options['stake']);
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
        $stake = $body['stake'] ?? null;
        if ($stake !== null && (!is_int($stake) || !in_array($stake, ZINGPLAY_STAKES, true))) {
            throw new ApiException(400, 'Mức cược không hợp lệ.');
        }
        if ($stake === null) {
            foreach (ZINGPLAY_STAKES as $candidate) {
                if ((int)$user['balance'] >= zingplayMinBalance($candidate)) {
                    $stake = $candidate;
                    break;
                }
            }
        }
        require_stake_balance((int)$user['balance'], $stake ?? ZINGPLAY_STAKES[0]);
        [$code, $created] = zingplay_transaction($pdo, static function () use ($pdo, $user, $stake): array {
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
                  WHERE r.auto_play = 1 AND r.is_public = 1 AND r.password_hash IS NULL AND r.stake = ?
                    AND r.status IN ('waiting', 'playing')
                  ORDER BY player_count DESC, r.created_at, r.code
                  LIMIT 50",
            );
            $candidates->execute([$stake]);
            foreach ($candidates->fetchAll() as $candidate) {
                if ((int)$candidate['player_count'] >= (int)$candidate['max_players']) {
                    continue;
                }
                try {
                    room_join($pdo, $user, $candidate['code'], null);
                    return [$candidate['code'], false];
                } catch (ApiException) {
                    continue;
                }
            }
            return [room_create($pdo, $user, [
                'isPublic' => true,
                'stake' => $stake,
                'autoPlay' => true,
                'maxPlayers' => 4,
                'passwordHash' => null,
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
        $password = $body['password'] ?? null;
        zingplay_transaction($pdo, static function () use ($pdo, $user, $code, $password): void {
            $lockUser = $pdo->prepare('SELECT id FROM users WHERE id = ?' . lock_clause($pdo));
            $lockUser->execute([$user['id']]);
            if (find_active_membership($pdo, $user['id'])) {
                throw new ApiException(409, 'Bạn đang ở trong một phòng.');
            }
            room_join($pdo, $user, $code, $password);
        });
        respond(200, room_snapshot($pdo, $user, $code));
    }

    if (preg_match('~^/rooms/([A-Z2-9]{5})$~', $route, $matches) === 1 && $method === 'GET') {
        $user = require_user($pdo);
        $code = $matches[1];
        $sinceRaw = $_GET['since_version'] ?? null;
        $since = null;
        if ($sinceRaw !== null) {
            $since = filter_var($sinceRaw, FILTER_VALIDATE_INT);
            if ($since === false || $since < 0) {
                throw new ApiException(400, 'since_version cần là số nguyên không âm.');
            }
        }
        $wait = $since !== null && ($_GET['wait'] ?? '') === '1' && zingplay_long_poll_enabled();
        $deadline = microtime(true) + ZINGPLAY_LONG_POLL_SECONDS;
        while (true) {
            $version = room_poll_version($pdo, $user, $code);
            if ($since === null || $version !== $since) {
                respond(200, room_snapshot($pdo, $user, $code));
            }
            if (!$wait || microtime(true) >= $deadline) {
                respond(200, ['changed' => false, 'version' => $version, 'serverTime' => zingplay_now_ms()]);
            }
            usleep(ZINGPLAY_LONG_POLL_STEP_MICROSECONDS);
        }
    }

    if (preg_match('~^/rooms/([A-Z2-9]{5})/(start|submit|leave)$~', $route, $matches) === 1
        && $method === 'POST') {
        $user = require_user($pdo);
        $code = $matches[1];
        $action = $matches[2];
        $body = $action === 'submit' ? json_body() : [];
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
                        zingplay_delete_room($pdo, $room);
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

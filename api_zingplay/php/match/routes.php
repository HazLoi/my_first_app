<?php
declare(strict_types=1);

function save_tienlen_history(PDO $pdo, array $room, array &$state, string $status, int $now): void
{
    if (!$pdo->inTransaction()) {
        throw new LogicException('Lưu lịch sử phải nằm trong transaction khóa bàn.');
    }
    if (($room['scoring_mode'] ?? 'coins') !== 'points'
        || !empty($state['historySaved']) || empty($state['historyRounds'])) {
        return;
    }
    $ids = $state['matchPlayerIds'];
    $totals = $state['matchTotals'];
    $ranked = $totals;
    arsort($ranked, SORT_NUMERIC);
    $places = [];
    $previous = null;
    $place = 0;
    $rank = 0;
    foreach ($ranked as $id => $total) {
        $place++;
        if ($previous === null || $previous !== $total) $rank = $place;
        $places[$id] = $rank;
        $previous = $total;
    }
    $players = [];
    foreach ($ids as $id) {
        $players[] = [
            'user_id' => $state['matchPlayerUsers'][$id] ?? null,
            'name' => $state['matchPlayerNames'][$id] ?? '',
            'total' => (int)($totals[$id] ?? 0),
            'rank' => $places[$id] ?? null,
            'left' => (bool)($state['matchLeft'][$id] ?? false),
        ];
    }
    $rounds = [];
    foreach ($state['historyRounds'] as $round) {
        $rounds[] = [
            'points' => array_map(static fn(string $id): int => (int)($round['points'][$id] ?? 0), $ids),
            'events' => $round['events'],
        ];
    }
    $statement = $pdo->prepare(
        'INSERT INTO match_history (id, game_type, table_name, target_score, status, started_at, ended_at, search_names, players_json, rounds_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $statement->execute([
        $state['historyId'], 'tienlen', $state['historyTableName'], (int)$room['target_score'],
        $status, $state['historyStartedAt'], gmdate('Y-m-d H:i:s', $now),
        implode("\n", array_column($players, 'name')),
        zingplay_json($players), zingplay_json($rounds),
    ]);
    $state['historySaved'] = true;

    $cutoff = gmdate('Y-m-d H:i:s', $now - gameplay_setting('history_retention_days', 1) * 86400);
    $pdo->prepare('DELETE FROM match_history WHERE ended_at < ?')->execute([$cutoff]);
    $limit = gameplay_setting('history_retention_count', 1);
    $boundary = $pdo->query(
        'SELECT ended_at, id FROM match_history ORDER BY ended_at DESC, id DESC LIMIT 1 OFFSET ' . $limit,
    )->fetch();
    if ($boundary) {
        $pdo->prepare('DELETE FROM match_history WHERE ended_at < ? OR (ended_at = ? AND id <= ?)')
            ->execute([$boundary['ended_at'], $boundary['ended_at'], $boundary['id']]);
    }
}

function history_row(array $row): array
{
    return [
        'id' => $row['id'], 'gameType' => $row['game_type'], 'tableName' => $row['table_name'],
        'targetScore' => $row['target_score'] === null ? null : (int)$row['target_score'],
        'status' => $row['status'], 'startedAt' => $row['started_at'], 'endedAt' => $row['ended_at'],
        'players' => decode_json($row['players_json']), 'rounds' => decode_json($row['rounds_json']),
    ];
}

function handle_match_routes(string $route, string $method, PDO $pdo): void
{
    if (in_array($route, ['/history', '/history.php'], true) && $method === 'GET') {
        require_user($pdo);
        $action = $_GET['action'] ?? 'list';
        if ($action === 'detail') {
            $id = $_GET['id'] ?? '';
            if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/D', $id)) {
                throw new ApiException(400, 'Mã trận không hợp lệ.');
            }
            $statement = $pdo->prepare('SELECT * FROM match_history WHERE id = ?');
            $statement->execute([$id]);
            $row = $statement->fetch();
            if (!$row) throw new ApiException(404, 'Không tìm thấy trận.');
            respond(200, ['match' => history_row($row)]);
        }
        if ($action !== 'list') throw new ApiException(400, 'Hành động không hợp lệ.');
        $page = filter_var($_GET['page'] ?? '1', FILTER_VALIDATE_INT);
        $game = $_GET['game_type'] ?? '';
        $name = $_GET['name'] ?? '';
        if ($page === false || $page < 1 || $page > 10000 || !is_string($game)
            || !in_array($game, ['', 'tienlen', 'xapxam'], true)
            || !is_string($name) || strlen($name) > 200) {
            throw new ApiException(400, 'Bộ lọc lịch sử không hợp lệ.');
        }
        $where = [];
        $params = [];
        if ($game !== '') {
            $where[] = 'game_type = ?';
            $params[] = $game;
        }
        if ($name !== '') {
            $where[] = "search_names LIKE ? ESCAPE '!'";
            $params[] = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $name) . '%';
        }
        $size = gameplay_setting('history_page_size', 1);
        $sql = 'SELECT * FROM match_history' . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
            . ' ORDER BY ended_at DESC, id DESC LIMIT ' . ($size + 1) . ' OFFSET ' . (($page - 1) * $size);
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        $rows = $statement->fetchAll();
        $hasMore = count($rows) > $size;
        if ($hasMore) array_pop($rows);
        respond(200, ['matches' => array_map('history_row', $rows), 'page' => $page, 'hasMore' => $hasMore]);
    }
    if ($route === '/matches' && $method === 'GET') {
        $user = require_user($pdo);
        $requestedLimit = $_GET['limit'] ?? '20';
        $limit = filter_var($requestedLimit, FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1 || $limit > 50) {
            throw new ApiException(400, 'limit cần là số nguyên từ 1 đến 50.');
        }
        $statement = $pdo->prepare(
            'SELECT matches.id, matches.room_code, matches.player_count,
                    matches.started_at, matches.finished_at, matches.seed, matches.round_no, match_players.display_name,
                    match_players.points, match_players.hands_json, match_players.chi_results_json
               FROM matches
               JOIN match_players ON match_players.match_id = matches.id
              WHERE match_players.user_id = ?
              ORDER BY matches.finished_at DESC
              LIMIT ' . (int)$limit,
        );
        $statement->execute([$user['id']]);
        $matches = array_map(static fn(array $match): array => [
            'id' => $match['id'],
            'roomCode' => $match['room_code'],
            'playerCount' => (int)$match['player_count'],
            'startedAt' => $match['started_at'],
            'finishedAt' => $match['finished_at'],
            'seed' => $match['seed'],
            'round' => $match['round_no'] === null ? null : (int)$match['round_no'],
            'displayName' => $match['display_name'],
            'points' => (int)$match['points'],
            'hands' => decode_json($match['hands_json']),
            'chiResults' => decode_json($match['chi_results_json']),
        ], $statement->fetchAll());
        respond(200, ['matches' => $matches]);
    }

}

<?php
declare(strict_types=1);

function handle_match_routes(string $route, string $method, PDO $pdo): void
{
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

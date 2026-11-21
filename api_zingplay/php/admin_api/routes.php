<?php
declare(strict_types=1);

const ADMIN_USER_ROUTE = '~^/admin/users/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(credit|debit|status)$~';

function admin_limit(int $default = 50): int
{
    $limit = filter_var($_GET['limit'] ?? (string)$default, FILTER_VALIDATE_INT);
    if ($limit === false || $limit < 1 || $limit > 100) {
        throw new ApiException(400, 'limit cần là số nguyên từ 1 đến 100.');
    }
    return $limit;
}

function admin_user_row(PDO $pdo, string $userId): array
{
    $statement = $pdo->prepare(
        'SELECT id, phone, display_name, role, status, balance, created_at FROM users WHERE id = ?',
    );
    $statement->execute([$userId]);
    $user = $statement->fetch();
    if (!$user) {
        throw new ApiException(404, 'Không tìm thấy tài khoản.');
    }
    return $user;
}

function admin_public_user(array $row): array
{
    return [
        'id' => $row['id'],
        'phone' => $row['phone'],
        'displayName' => $row['display_name'],
        'role' => $row['role'],
        'status' => $row['status'],
        'balance' => (int)$row['balance'],
        'createdAt' => $row['created_at'],
    ];
}

function handle_admin_routes(string $route, string $method, PDO $pdo): void
{
    if (!str_starts_with($route, '/admin/')) {
        return;
    }
    $admin = require_admin($pdo);

    if ($route === '/admin/stats' && $method === 'GET') {
        $stats = $pdo->query(
            "SELECT
               (SELECT COUNT(*) FROM users) AS users,
               (SELECT COUNT(*) FROM users WHERE status = 'locked') AS locked_users,
               (SELECT COALESCE(SUM(balance), 0) FROM users) AS total_balance,
               (SELECT COUNT(*) FROM game_rooms WHERE status IN ('waiting', 'playing')) AS active_rooms,
               (SELECT COUNT(*) FROM matches) AS matches",
        )->fetch();
        $today = $pdo->prepare('SELECT COUNT(*) FROM matches WHERE finished_at >= ?');
        $today->execute([gmdate('Y-m-d 00:00:00')]);
        respond(200, ['stats' => [
            'users' => (int)$stats['users'],
            'lockedUsers' => (int)$stats['locked_users'],
            'totalBalance' => (int)$stats['total_balance'],
            'activeRooms' => (int)$stats['active_rooms'],
            'matches' => (int)$stats['matches'],
            'matchesToday' => (int)$today->fetchColumn(),
        ]]);
    }

    if ($route === '/admin/users' && $method === 'GET') {
        $limit = admin_limit();
        $search = $_GET['search'] ?? '';
        if (!is_string($search) || strlen($search) > 40) {
            throw new ApiException(400, 'Từ khóa tìm kiếm không hợp lệ.');
        }
        $search = trim($search);
        $sql = 'SELECT id, phone, display_name, role, status, balance, created_at FROM users';
        $params = [];
        if ($search !== '') {
            $like = '%' . preg_replace('/[!%_]/', '!$0', $search) . '%';
            $sql .= " WHERE phone LIKE ? ESCAPE '!' OR display_name LIKE ? ESCAPE '!'";
            $params = [$like, $like];
        }
        $statement = $pdo->prepare($sql . ' ORDER BY created_at DESC, id LIMIT ' . $limit);
        $statement->execute($params);
        respond(200, ['users' => array_map('admin_public_user', $statement->fetchAll())]);
    }

    if ($route === '/admin/transactions' && $method === 'GET') {
        $limit = admin_limit();
        $sql = 'SELECT t.id, t.user_id, u.phone, u.display_name, t.type, t.amount, t.balance_after,
                       t.match_id, t.note, t.created_at, a.phone AS admin_phone
                  FROM wallet_transactions t
                  JOIN users u ON u.id = t.user_id
             LEFT JOIN users a ON a.id = t.admin_id';
        $params = [];
        $userId = $_GET['userId'] ?? null;
        if ($userId !== null) {
            if (!is_string($userId) || strlen($userId) !== 36) {
                throw new ApiException(400, 'userId không hợp lệ.');
            }
            $sql .= ' WHERE t.user_id = ?';
            $params[] = $userId;
        }
        $statement = $pdo->prepare($sql . ' ORDER BY t.id DESC LIMIT ' . $limit);
        $statement->execute($params);
        respond(200, ['transactions' => array_map(static fn(array $row): array => [
            'id' => (int)$row['id'],
            'userId' => $row['user_id'],
            'phone' => $row['phone'],
            'displayName' => $row['display_name'],
            'type' => $row['type'],
            'amount' => (int)$row['amount'],
            'balanceAfter' => (int)$row['balance_after'],
            'matchId' => $row['match_id'],
            'note' => $row['note'],
            'adminPhone' => $row['admin_phone'],
            'createdAt' => $row['created_at'],
        ], $statement->fetchAll())]);
    }

    if ($route === '/admin/matches' && $method === 'GET') {
        $matches = $pdo->query(
            'SELECT id, room_code, player_count, stake, finished_at FROM matches
              ORDER BY finished_at DESC LIMIT 20',
        )->fetchAll();
        $players = $pdo->prepare(
            'SELECT display_name, points, chip_delta FROM match_players WHERE match_id = ? ORDER BY seat_number',
        );
        $payload = [];
        foreach ($matches as $match) {
            $players->execute([$match['id']]);
            $payload[] = [
                'id' => $match['id'],
                'roomCode' => $match['room_code'],
                'stake' => (int)$match['stake'],
                'finishedAt' => $match['finished_at'],
                'players' => array_map(static fn(array $player): array => [
                    'displayName' => $player['display_name'],
                    'points' => (int)$player['points'],
                    'chips' => (int)$player['chip_delta'],
                ], $players->fetchAll()),
            ];
        }
        respond(200, ['matches' => $payload]);
    }

    if (preg_match(ADMIN_USER_ROUTE, $route, $matches) === 1 && $method === 'POST') {
        [, $userId, $action] = $matches;
        $body = json_body();
        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT id, balance FROM users WHERE id = ?' . lock_clause($pdo));
            $lock->execute([$userId]);
            $target = $lock->fetch();
            if (!$target) {
                throw new ApiException(404, 'Không tìm thấy tài khoản.');
            }
            if ($action === 'status') {
                $status = $body['status'] ?? null;
                if (!in_array($status, ['active', 'locked'], true)) {
                    throw new ApiException(400, 'Trạng thái không hợp lệ.');
                }
                if ($userId === $admin['id']) {
                    throw new ApiException(409, 'Không thể tự khóa tài khoản của mình.');
                }
                $update = $pdo->prepare('UPDATE users SET status = ? WHERE id = ?');
                $update->execute([$status, $userId]);
                if ($status === 'locked') {
                    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
                }
            } else {
                $amount = $body['amount'] ?? null;
                if (!is_int($amount) || $amount < 1 || $amount > MAX_ADMIN_AMOUNT) {
                    throw new ApiException(400, 'Số xu phải là số nguyên từ 1 đến ' . MAX_ADMIN_AMOUNT . '.');
                }
                $note = $body['note'] ?? null;
                if ($note !== null && (!is_string($note) || strlen($note) > 255)) {
                    throw new ApiException(400, 'Ghi chú tối đa 255 ký tự.');
                }
                $note = $note === null || trim($note) === '' ? null : trim($note);
                $delta = $action === 'credit' ? $amount : -$amount;
                $balanceAfter = (int)$target['balance'] + $delta;
                if ($balanceAfter < 0) {
                    throw new ApiException(409, 'Số dư không đủ để trừ.');
                }
                $update = $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?');
                $update->execute([$balanceAfter, $userId]);
                record_wallet_transaction(
                    $pdo,
                    $userId,
                    $action === 'credit' ? 'admin_credit' : 'admin_debit',
                    $delta,
                    $balanceAfter,
                    null,
                    $admin['id'],
                    $note,
                );
            }
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
        respond(200, ['user' => admin_public_user(admin_user_row($pdo, $userId))]);
    }
}

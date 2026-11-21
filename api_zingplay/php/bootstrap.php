<?php
declare(strict_types=1);

require_once __DIR__ . '/rules.php';
require_once __DIR__ . '/phase.php';
require_once __DIR__ . '/config/database.php';

const SIGNUP_BONUS = 10000;
const MAX_ADMIN_AMOUNT = 1000000000;

final class ApiException extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

// Dùng cho test trong tiến trình: khi $GLOBALS['ZINGPLAY_CAPTURE'] bật, respond() ném ngoại lệ thay vì exit.
final class ZingplayCapturedResponse extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly array $payload)
    {
        parent::__construct('Phản hồi đã được ghi lại.');
    }
}

function respond(int $status, array $payload): never
{
    if (!empty($GLOBALS['ZINGPLAY_CAPTURE'])) {
        throw new ZingplayCapturedResponse($status, $payload);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function raw_body(): string
{
    return $GLOBALS['ZINGPLAY_BODY'] ?? (file_get_contents('php://input') ?: '');
}

// Thân yêu cầu có thể bỏ trống (coi như {}).
function json_body_optional(): array
{
    return trim(raw_body()) === '' ? [] : json_body();
}

function json_body(): array
{
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 16384) {
        throw new ApiException(413, 'Yêu cầu quá lớn.');
    }
    $raw = raw_body();
    if (strlen($raw) > 16384) {
        throw new ApiException(413, 'Yêu cầu quá lớn.');
    }
    try {
        $data = json_decode($raw ?: '', false, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new ApiException(400, 'Yêu cầu JSON không hợp lệ.');
    }
    if (!($data instanceof stdClass)) {
        throw new ApiException(400, 'Yêu cầu JSON phải là một đối tượng.');
    }
    return json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
}

function new_id(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
        . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function normalize_phone(mixed $value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $phone = preg_replace('/[\s().-]/', '', trim($value));
    if (preg_match('/^0\d{9}$/', $phone) === 1) {
        return '+84' . substr($phone, 1);
    }
    if (preg_match('/^84\d{9}$/', $phone) === 1) {
        return '+' . $phone;
    }
    return preg_match('/^\+[1-9]\d{7,14}$/', $phone) === 1 ? $phone : null;
}

function valid_password(mixed $password): bool
{
    return is_string($password) && $password !== '' && strlen($password) <= 128;
}

function server_error_message(Throwable $exception): string
{
    if ($exception instanceof PDOException) {
        $mysqlCode = $exception->errorInfo[1] ?? null;
        if (in_array($mysqlCode, [1044, 1045, 1142], true)) {
            return 'Không thể truy cập database. Kiểm tra tài khoản và quyền database trên hosting.';
        }
        if ($mysqlCode === 1049) {
            return 'Không tìm thấy database. Kiểm tra tên database trên hosting.';
        }
        if ($mysqlCode === 1146) {
            return 'Database thiếu bảng. Hãy nhập schema.sql vào database game.';
        }
        if ($mysqlCode === 1054) {
            return 'Cấu trúc bảng database không khớp với API. Hãy kiểm tra schema database.';
        }
        if ($mysqlCode === 2002) {
            return 'Không kết nối được database. Kiểm tra máy chủ database trên hosting.';
        }
        if ($exception->getMessage() === 'could not find driver') {
            return 'Hosting chưa bật PDO MySQL. Hãy bật extension pdo_mysql.';
        }
    }
    return 'Máy chủ không thể xử lý yêu cầu. Vui lòng thử lại.';
}

function public_user(array $row): array
{
    $user = [
        'id' => $row['id'],
        'phone' => $row['phone'],
        'displayName' => $row['display_name'],
        'role' => $row['role'] ?? 'player',
        'balance' => (int)($row['balance'] ?? 0),
    ];
    if (isset($row['autoTopupAmount'])) {
        $user['autoTopupAmount'] = (int)$row['autoTopupAmount'];
    }
    return $user;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') {
                $header = $value;
                break;
            }
        }
    }
    if (preg_match('/^Bearer ([A-Za-z0-9_-]{40,64})$/i', $header, $matches) !== 1) {
        return null;
    }
    return $matches[1];
}

function require_user(PDO $pdo): array
{
    $token = bearer_token();
    if ($token === null) {
        throw new ApiException(401, 'Vui lòng đăng nhập lại.');
    }
    $statement = $pdo->prepare(
        'SELECT users.id, users.phone, users.display_name, users.role, users.status, users.balance
           FROM sessions
           JOIN users ON users.id = sessions.user_id
          WHERE sessions.token_hash = ? AND sessions.expires_at > UTC_TIMESTAMP()
          LIMIT 1',
    );
    $statement->execute([hash('sha256', $token)]);
    $user = $statement->fetch();
    if (!$user) {
        throw new ApiException(401, 'Phiên đăng nhập đã hết hạn.');
    }
    if ($user['status'] !== 'active') {
        throw new ApiException(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }
    return $user;
}

function gameplay_config(): array
{
    static $defaults = null;
    $defaults ??= require __DIR__ . '/config/gameplay.php';
    $overrides = zingplay_config()['gameplay'] ?? [];
    return array_replace($defaults, is_array($overrides) ? $overrides : []);
}

function gameplay_setting(string $key, int $minimum = 0): int
{
    $value = gameplay_config()[$key] ?? null;
    if (!is_int($value) || $value < $minimum) {
        throw new LogicException('Cấu hình gameplay ' . $key . ' không hợp lệ.');
    }
    return $value;
}

function lock_clause(PDO $pdo): string
{
    return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
}

function require_admin(PDO $pdo): array
{
    $user = require_user($pdo);
    if ($user['role'] !== 'admin') {
        throw new ApiException(403, 'Bạn không có quyền quản trị.');
    }
    return $user;
}

function record_wallet_transaction(
    PDO $pdo,
    string $userId,
    string $type,
    int $amount,
    int $balanceAfter,
    ?string $matchId = null,
    ?string $adminId = null,
    ?string $note = null,
): void {
    $statement = $pdo->prepare(
        'INSERT INTO wallet_transactions (user_id, type, amount, balance_after, match_id, admin_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    $statement->execute([$userId, $type, $amount, $balanceAfter, $matchId, $adminId, $note]);
}

function ensureMinCoins(PDO $pdo, string $userId): ?int
{
    $below = gameplay_setting('auto_topup_below');
    $target = gameplay_setting('auto_topup_to', 1);
    if ($target <= $below) {
        throw new LogicException('Cấu hình xu tự tặng phải lớn hơn ngưỡng tối thiểu.');
    }

    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }
    try {
        $statement = $pdo->prepare('SELECT balance FROM users WHERE id = ?' . lock_clause($pdo));
        $statement->execute([$userId]);
        $balance = $statement->fetchColumn();
        if ($balance === false) {
            throw new RuntimeException('Không tìm thấy tài khoản khi kiểm tra số dư.');
        }
        $balance = (int)$balance;
        if ($balance >= $below) {
            if ($ownsTransaction) {
                $pdo->commit();
            }
            return null;
        }

        $amount = $target - $balance;
        $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?')->execute([$target, $userId]);
        record_wallet_transaction($pdo, $userId, 'auto_topup', $amount, $target, null, null, 'Tự tặng xu');
        if ($ownsTransaction) {
            $pdo->commit();
        }
        return $target;
    } catch (Throwable $exception) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function require_stake_balance(int $balance, int $stake): void
{
    $required = zingplayMinBalance($stake);
    if ($balance < $required) {
        throw new ApiException(
            409,
            'Cần tối thiểu ' . $required . ' xu để chơi mức cược ' . $stake . ' xu/điểm.',
        );
    }
}

function create_session(PDO $pdo, string $userId): array
{
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $expires = new DateTimeImmutable('+7 days', new DateTimeZone('UTC'));
    $statement = $pdo->prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    );
    $statement->execute([
        hash('sha256', $token),
        $userId,
        $expires->format('Y-m-d H:i:s'),
    ]);
    return ['accessToken' => $token, 'expiresAt' => $expires->format(DateTimeInterface::ATOM)];
}

function decode_json(?string $value): mixed
{
    return $value === null ? null : json_decode($value, true, 64, JSON_THROW_ON_ERROR);
}

function cleanup_rooms(PDO $pdo): void
{
    $now = zingplay_now();
    $interval = gameplay_setting('room_cleanup_interval_seconds', 1);
    $batchSize = min(gameplay_setting('room_cleanup_batch_size', 1), 50);
    $idleSeconds = gameplay_setting('room_player_idle_seconds', 1);
    $retentionSeconds = gameplay_setting('empty_room_retention_seconds', 1);
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }

    try {
        $meta = $pdo->prepare(
            'SELECT last_room_cleanup FROM maintenance_meta WHERE id = 1' . lock_clause($pdo),
        );
        $meta->execute();
        $lastCleanup = $meta->fetchColumn();
        if ($lastCleanup === false) {
            throw new RuntimeException('Thiếu dòng khóa bảo trì maintenance_meta.');
        }
        if ($now - (int)$lastCleanup < $interval) {
            if ($ownsTransaction) {
                $pdo->commit();
            }
            return;
        }
        $pdo->prepare('UPDATE maintenance_meta SET last_room_cleanup = ? WHERE id = 1')->execute([$now]);

        $candidates = $pdo->prepare(
            'SELECT r.code
               FROM game_rooms r
              WHERE (r.empty_since IS NOT NULL AND r.empty_since <= ?)
                 OR NOT EXISTS (
                      SELECT 1 FROM game_room_players p
                       WHERE p.room_code = r.code AND p.left_round = 0
                 )
                 OR EXISTS (
                      SELECT 1 FROM game_room_players p
                       WHERE p.room_code = r.code AND p.left_round = 0 AND p.last_seen > 0 AND p.last_seen < ?
                 )
                 OR (r.auto_play = 0 AND r.game_type = \'xapxam\' AND r.status = \'finished\' AND r.finished_at < ?)
              ORDER BY COALESCE(r.empty_since, 0), r.created_at, r.code
              LIMIT ' . $batchSize,
        );
        $candidates->execute([
            $now - $retentionSeconds,
            $now - $idleSeconds,
            gmdate('Y-m-d H:i:s', $now - 600),
        ]);
        $codes = $candidates->fetchAll(PDO::FETCH_COLUMN);
        $engine = null;

        foreach ($codes as $code) {
            $room = zingplay_lock_room($pdo, (string)$code);
            if (!$room) {
                continue;
            }
            if ((int)$room['auto_play'] === 0 && $room['game_type'] === 'xapxam'
                && $room['status'] === 'finished' && $room['finished_at'] !== null
                && $room['finished_at'] < gmdate('Y-m-d H:i:s', $now - 600)) {
                zingplay_delete_room($pdo, $room);
                continue;
            }
            $players = zingplay_lock_players($pdo, (string)$code);
            $staleIds = [];
            foreach ($players as $player) {
                if ((int)$player['left_round'] === 0 && (int)$player['last_seen'] > 0
                    && $now - (int)$player['last_seen'] > $idleSeconds) {
                    $staleIds[] = $player['player_id'];
                }
            }

            foreach ($staleIds as $playerId) {
                $players = zingplay_lock_players($pdo, (string)$code);
                $selfIndex = null;
                foreach ($players as $index => $player) {
                    if ($player['player_id'] === $playerId && (int)$player['left_round'] === 0) {
                        $selfIndex = $index;
                        break;
                    }
                }
                if ($selfIndex === null) {
                    continue;
                }
                if ($room['game_type'] === 'tienlen') {
                    $engine ??= new TienLenEngine();
                    $engine->leave($pdo, $room, $players, $selfIndex, $now);
                } elseif ((int)$room['auto_play'] === 1) {
                    room_leave_auto($pdo, $room, $players, $selfIndex, $now);
                } else {
                    room_leave_stale($pdo, $room, $players, $selfIndex, $now);
                }
                if (!empty($room['deleted'])) {
                    continue 2;
                }
            }

            $players = zingplay_lock_players($pdo, (string)$code);
            $active = zingplay_active_players($players);
            if ($active !== []) {
                if (($room['empty_since'] ?? null) !== null) {
                    zingplay_update_room($pdo, $room, ['empty_since' => null], $now);
                }
                continue;
            }

            $emptySince = isset($room['empty_since']) ? (int)$room['empty_since'] : null;
            if ($emptySince === null) {
                zingplay_update_room($pdo, $room, ['empty_since' => $now], $now);
                continue;
            }
            if ($now - $emptySince < $retentionSeconds) {
                continue;
            }

            $unfinishedRound = $room['status'] === 'playing'
                && in_array($room['phase'], ['dealing', 'arranging', 'playing'], true)
                && (int)$room['round_no'] > 0;
            if ($room['game_type'] === 'tienlen' && ($room['scoring_mode'] ?? 'coins') === 'points') {
                $state = $room['game_state'] ? json_decode($room['game_state'], true, 512, JSON_THROW_ON_ERROR) : [];
                save_tienlen_history($pdo, $room, $state, 'abandoned', $now);
            } elseif ($unfinishedRound
                && !function_exists('save_room_history_before_cleanup')) {
                continue;
            } elseif ($unfinishedRound) {
                save_room_history_before_cleanup($pdo, $room, $players, $now);
            }
            zingplay_delete_room($pdo, $room);
        }

        if ($ownsTransaction) {
            $pdo->commit();
        }
    } catch (Throwable $exception) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

function find_active_membership(PDO $pdo, string $userId): ?array
{
    $statement = $pdo->prepare(
        "SELECT game_room_players.player_id, game_room_players.room_code, game_rooms.game_type
           FROM game_room_players
           JOIN game_rooms ON game_rooms.code = game_room_players.room_code
          WHERE game_room_players.user_id = ? AND game_room_players.left_round = 0
            AND game_rooms.status IN ('waiting', 'playing')
          LIMIT 1",
    );
    $statement->execute([$userId]);
    return $statement->fetch() ?: null;
}

function room_phase(array $room): string
{
    if ((int)($room['auto_play'] ?? 0) === 1) {
        return (string)$room['phase'];
    }
    return ['waiting' => 'waiting', 'playing' => 'arranging', 'finished' => 'summary'][$room['status']] ?? 'waiting';
}

function room_results_visible(array $room): bool
{
    return (int)($room['auto_play'] ?? 0) === 1
        ? in_array($room['phase'], ZINGPLAY_RESULT_PHASES, true)
        : $room['status'] === 'finished';
}

// `$balanceBefore`: player_id => số dư trước thanh toán (che kết quả trong lúc revealing/scoring).
function public_room(array $room, array $players, array $balanceBefore = []): array
{
    $auto = (int)($room['auto_play'] ?? 0) === 1;
    $phase = room_phase($room);
    $running = $auto && $room['status'] === 'playing';
    $visible = room_results_visible($room);
    $public = [
        'code' => $room['code'],
        'hostId' => $room['host_player_id'],
        'started' => in_array($room['status'], ['playing', 'finished'], true),
        'finished' => $visible,
        'stake' => (int)$room['stake'],
        'maxPlayers' => (int)($room['max_players'] ?? 4),
        'hasPassword' => ($room['password_hash'] ?? null) !== null,
        'autoPlay' => $auto,
        'phase' => $phase,
        'phaseStartedAt' => (int)($room['phase_started_at'] ?? 0) * 1000,
        'phaseDeadline' => ($room['phase_deadline'] ?? null) === null ? null : (int)$room['phase_deadline'] * 1000,
        'round' => (int)($room['round_no'] ?? 0),
        'players' => array_map(static fn(array $player): array => [
            'id' => $player['player_id'],
            'name' => $player['display_name'],
            'submitted' => $player['arrangement_json'] !== null,
            'seat' => (int)$player['seat_number'],
            'balance' => $balanceBefore[$player['player_id']] ?? (int)$player['balance'],
            'spectator' => $running && !zingplay_is_participant($player),
            'left' => (int)($player['left_round'] ?? 0) === 1,
        ], $players),
    ];
    if (($room['cancel_message'] ?? null) !== null && $auto && $room['status'] === 'waiting') {
        $public['cancelMessage'] = $room['cancel_message'];
    }
    return $public;
}

function room_snapshot(PDO $pdo, array $user, string $code): array
{
    $statement = $pdo->prepare(
        'SELECT * FROM game_rooms WHERE code = ? LIMIT 1',
    );
    $statement->execute([$code]);
    $room = $statement->fetch();
    if (!$room) {
        throw new ApiException(404, 'Không tìm thấy phòng với mã này.');
    }
    if (($room['game_type'] ?? 'xapxam') === 'tienlen') {
        require_once __DIR__ . '/games/tienlen/TienLenEngine.php';
        $snapshot = (new TienLenEngine())->viewFor($pdo, $user, $code);
        if (isset($user['autoTopupAmount'])) {
            $snapshot['autoTopupAmount'] = (int)$user['autoTopupAmount'];
        }
        return $snapshot;
    }
    $playersStatement = $pdo->prepare(
        'SELECT p.player_id, p.user_id, p.seat_number, p.display_name, p.hand_json, p.arrangement_json,
                p.left_round, u.balance
           FROM game_room_players p
           JOIN users u ON u.id = p.user_id
          WHERE p.room_code = ? ORDER BY p.seat_number',
    );
    $playersStatement->execute([$code]);
    $players = $playersStatement->fetchAll();
    $self = null;
    foreach ($players as $player) {
        if ($player['user_id'] === $user['id'] && (int)$player['left_round'] === 0) {
            $self = $player;
            break;
        }
    }
    if (!$self) {
        throw new ApiException(403, 'Tài khoản của bạn không thuộc phòng này.');
    }
    $envelope = ['serverTime' => zingplay_now_ms(), 'version' => (int)$room['version']];
    if ($room['status'] === 'cancelled') {
        return $envelope + [
            'room' => [
                'code' => $room['code'],
                'hostId' => $room['host_player_id'],
                'started' => false,
                'finished' => false,
                'stake' => (int)$room['stake'],
                'cancelled' => true,
                'cancelMessage' => $room['cancel_message'] ?: 'Ván đã bị hủy.',
                'maxPlayers' => (int)$room['max_players'],
                'hasPassword' => $room['password_hash'] !== null,
                'autoPlay' => false,
                'phase' => 'waiting',
                'phaseStartedAt' => 0,
                'phaseDeadline' => null,
                'round' => (int)$room['round_no'],
                'players' => [],
            ],
            'playerId' => $self['player_id'],
            'cards' => [],
            'arrangement' => null,
            'submitted' => false,
            'results' => null,
            'balance' => (int)$self['balance'],
        ];
    }
    $visible = room_results_visible($room);
    $results = $visible ? decode_json($room['results_json']) : null;
    // Trong revealing/scoring chỉ báo số dư trước thanh toán để UI không lộ kết quả sớm.
    $balanceBefore = [];
    if ($results !== null && in_array($room['phase'], ['revealing', 'scoring'], true)
        && (int)$room['auto_play'] === 1) {
        foreach ($results['players'] as $result) {
            $balanceBefore[$result['id']] = (int)$result['balanceBefore'];
        }
    }
    $spectator = (int)$room['auto_play'] === 1 && $room['status'] === 'playing' && !zingplay_is_participant($self);
    return $envelope + [
        'room' => public_room($room, $players, $balanceBefore),
        'playerId' => $self['player_id'],
        'cards' => $room['status'] === 'waiting' || $spectator ? [] : decode_json($self['hand_json']),
        'arrangement' => decode_json($self['arrangement_json']),
        'submitted' => $self['arrangement_json'] !== null,
        'results' => $results,
        'historySaved' => $visible,
        'balance' => $balanceBefore[$self['player_id']] ?? (int)$self['balance'],
    ] + (isset($user['autoTopupAmount']) ? ['autoTopupAmount' => (int)$user['autoTopupAmount']] : []);
}

function user_balance(PDO $pdo, string $userId): int
{
    $statement = $pdo->prepare('SELECT balance FROM users WHERE id = ?');
    $statement->execute([$userId]);
    return (int)$statement->fetchColumn();
}

function make_room_code(PDO $pdo): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $code = '';
        for ($index = 0; $index < 5; $index++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $statement = $pdo->prepare('SELECT 1 FROM game_rooms WHERE code = ?');
        $statement->execute([$code]);
        if (!$statement->fetchColumn()) {
            return $code;
        }
    }
    throw new RuntimeException('Không tạo được mã phòng duy nhất.');
}

// Khóa các tài khoản theo thứ tự id để hai ván kết thúc cùng lúc không khóa chéo nhau.
function settle_match_chips(PDO $pdo, array $players, array $results, int $stake, string $matchId): array
{
    $userIds = array_column($players, 'user_id');
    sort($userIds);
    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $lock = $pdo->prepare("SELECT id, balance FROM users WHERE id IN ($placeholders) ORDER BY id" . lock_clause($pdo));
    $lock->execute($userIds);
    $balances = [];
    foreach ($lock->fetchAll() as $row) {
        $balances[$row['id']] = (int)$row['balance'];
    }
    $userByPlayer = array_column($players, 'user_id', 'player_id');
    $deltas = [];
    foreach ($results as $result) {
        $deltas[$userByPlayer[$result['id']]] = $result['points'] * $stake;
    }
    $settled = zingplaySettleChips($deltas, $balances);
    $update = $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?');
    foreach ($results as &$result) {
        $userId = $userByPlayer[$result['id']];
        $delta = $settled[$userId];
        $balanceAfter = $balances[$userId] + $delta;
        $result['chips'] = $delta;
        $result['balanceBefore'] = $balances[$userId];
        if ($delta !== 0) {
            $update->execute([$balanceAfter, $userId]);
            record_wallet_transaction($pdo, $userId, 'match_result', $delta, $balanceAfter, $matchId);
        }
        $autoTopup = ensureMinCoins($pdo, $userId);
        $result['balanceAfter'] = user_balance($pdo, $userId);
        if ($autoTopup !== null) {
            $result['autoTopupAmount'] = $autoTopup;
        }
    }
    unset($result);
    return $results;
}

function save_match(
    PDO $pdo,
    array $room,
    array $players,
    array $results,
    string $matchId,
    int $stake,
    ?int $now = null,
): void {
    $finishedAt = gmdate('Y-m-d H:i:s', $now ?? zingplay_now());
    $match = $pdo->prepare(
        'INSERT INTO matches (id, room_code, player_count, stake, started_at, finished_at, seed, round_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $match->execute([
        $matchId,
        $room['code'],
        count($players),
        $stake,
        $room['started_at'],
        $finishedAt,
        $room['seed'] ?? null,
        isset($room['round_no']) ? (int)$room['round_no'] : null,
    ]);
    $insertPlayer = $pdo->prepare(
        'INSERT INTO match_players
          (match_id, user_id, seat_number, display_name, points, chip_delta, balance_after,
           hands_json, chi_results_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    $resultsById = [];
    foreach ($results as $result) {
        $resultsById[$result['id']] = $result;
    }
    foreach ($players as $player) {
        $result = $resultsById[$player['player_id']] ?? null;
        if ($result === null) {
            throw new RuntimeException('Thiếu kết quả người chơi khi lưu lịch sử.');
        }
        $insertPlayer->execute([
            $matchId,
            $player['user_id'],
            $player['seat_number'],
            $player['display_name'],
            $result['points'],
            $result['chips'],
            $result['balanceAfter'],
            $player['arrangement_json'],
            json_encode($result['chi'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }
}

require_once __DIR__ . '/user/routes.php';
require_once __DIR__ . '/match/routes.php';
require_once __DIR__ . '/room/routes.php';
require_once __DIR__ . '/admin_api/routes.php';

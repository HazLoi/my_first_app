<?php
declare(strict_types=1);

// Harness dùng chung cho test PHP: dựng schema (MariaDB nếu đặt ZP_MYSQL_DSN, ngược lại SQLite)
// và gọi trực tiếp các handler của API trong tiến trình, với thời gian giả lập $GLOBALS['ZINGPLAY_NOW'].
//
//   ZP_MYSQL_DSN='mysql:host=127.0.0.1;port=3307;dbname=zp_test' ZP_MYSQL_USER=zp ZP_MYSQL_PASS=zp php tests/xxx.php

require_once __DIR__ . '/../bootstrap.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function zp_driver(): string
{
    return getenv('ZP_MYSQL_DSN') ? 'mysql' : 'sqlite';
}

function zp_sqlite_schema(): string
{
    return <<<'SQL'
CREATE TABLE users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, display_name TEXT, password_salt TEXT, password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'player', status TEXT NOT NULL DEFAULT 'active', balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE matches (id TEXT PRIMARY KEY, room_code TEXT, player_count INTEGER, stake INTEGER NOT NULL DEFAULT 50,
  started_at TEXT, finished_at TEXT, seed TEXT, round_no INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE match_players (match_id TEXT REFERENCES matches(id) ON DELETE CASCADE, user_id TEXT, seat_number INTEGER,
  display_name TEXT, points INTEGER, chip_delta INTEGER NOT NULL DEFAULT 0, balance_after INTEGER, hands_json TEXT,
  chi_results_json TEXT, PRIMARY KEY (match_id, user_id));
CREATE TABLE game_rooms (code TEXT PRIMARY KEY, host_player_id TEXT, status TEXT NOT NULL DEFAULT 'waiting',
  is_public INTEGER NOT NULL DEFAULT 0, stake INTEGER NOT NULL DEFAULT 50,
  game_type TEXT NOT NULL DEFAULT 'xapxam', game_state TEXT, started_at TEXT, finished_at TEXT,
  results_json TEXT, cancel_message TEXT, auto_play INTEGER NOT NULL DEFAULT 0, max_players INTEGER NOT NULL DEFAULT 4,
  password_hash TEXT, phase TEXT NOT NULL DEFAULT 'waiting', phase_started_at INTEGER NOT NULL DEFAULT 0,
  phase_deadline INTEGER, version INTEGER NOT NULL DEFAULT 0, round_no INTEGER NOT NULL DEFAULT 0, seed TEXT,
  last_activity INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE game_room_players (player_id TEXT PRIMARY KEY, room_code TEXT REFERENCES game_rooms(code) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, seat_number INTEGER, display_name TEXT, hand_json TEXT NOT NULL,
  arrangement_json TEXT, last_seen INTEGER NOT NULL DEFAULT 0, left_round INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX game_room_players_user_idx ON game_room_players (room_code, user_id);
CREATE UNIQUE INDEX game_room_players_seat_idx ON game_room_players (room_code, seat_number);
CREATE TABLE wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, type TEXT, amount INTEGER,
  balance_after INTEGER, match_id TEXT, admin_id TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
SQL;
}

// Tách schema.sql thành từng câu lệnh (bỏ dòng chú thích) để nạp qua PDO::exec.
function zp_sql_statements(string $sql): array
{
    $lines = array_filter(explode("\n", $sql), static fn(string $line): bool => !str_starts_with(ltrim($line), '--'));
    $statements = [];
    foreach (explode(';', implode("\n", $lines)) as $statement) {
        if (trim($statement) !== '') {
            $statements[] = trim($statement);
        }
    }
    return $statements;
}

function zp_run_sql_file(PDO $pdo, string $path): void
{
    foreach (zp_sql_statements((string)file_get_contents($path)) as $statement) {
        $pdo->exec($statement);
    }
}

function zp_mysql_connect(): PDO
{
    $pdo = new PDO((string)getenv('ZP_MYSQL_DSN') . ';charset=utf8mb4', (string)getenv('ZP_MYSQL_USER'), (string)getenv('ZP_MYSQL_PASS'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function zp_mysql_drop_all(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $pdo->exec('DROP TABLE `' . $table . '`');
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

// Tạo kết nối mới với schema sạch từ schema.sql (MariaDB) hoặc schema SQLite tương đương.
function zp_fresh_database(): PDO
{
    if (zp_driver() === 'mysql') {
        $pdo = zp_mysql_connect();
        zp_mysql_drop_all($pdo);
        zp_run_sql_file($pdo, __DIR__ . '/../../schema.sql');
        return $pdo;
    }
    $pdo = new PDO('sqlite::memory:', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->sqliteCreateFunction('UTC_TIMESTAMP', static fn(): string => gmdate('Y-m-d H:i:s', zingplay_now()));
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec(zp_sqlite_schema());
    return $pdo;
}

function zp_set_time(int $seconds): void
{
    $GLOBALS['ZINGPLAY_NOW'] = $seconds;
}

function zp_advance_time(int $seconds): void
{
    $GLOBALS['ZINGPLAY_NOW'] = zingplay_now() + $seconds;
}

// Gọi API như index.php (cùng thứ tự dispatch); trả về ['status' => int, 'body' => array].
function zp_api(PDO $pdo, string $method, string $route, ?string $token = null, ?array $body = null, array $query = []): array
{
    $GLOBALS['ZINGPLAY_CAPTURE'] = true;
    $GLOBALS['ZINGPLAY_BODY'] = $body === null ? '' : ($body === [] ? '{}' : json_encode($body, JSON_UNESCAPED_UNICODE));
    $_GET = $query;
    unset($_SERVER['HTTP_AUTHORIZATION']);
    if ($token !== null) {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . $token;
    }
    try {
        $isRoomPoll = $method === 'GET' && preg_match('~^/rooms/[A-Z2-9]{5}$~', $route) === 1;
        if (($route === '/rooms' || str_starts_with($route, '/rooms/')) && !$isRoomPoll) {
            cleanup_rooms($pdo);
        }
        handle_user_routes($route, $method, $pdo);
        handle_match_routes($route, $method, $pdo);
        handle_room_routes($route, $method, $pdo);
        handle_admin_routes($route, $method, $pdo);
        throw new ApiException(404, 'Không tìm thấy API.');
    } catch (ZingplayCapturedResponse $response) {
        return ['status' => $response->status, 'body' => $response->payload];
    } catch (ApiException $exception) {
        return ['status' => $exception->status, 'body' => ['error' => $exception->getMessage()]];
    }
}

// Đăng ký người chơi mới (qua API), trả về ['token', 'id', 'name'].
function zp_register(PDO $pdo, string $phone, string $password = 'a'): array
{
    $response = zp_api($pdo, 'POST', '/auth/register', null, ['phone' => $phone, 'password' => $password]);
    check($response['status'] === 201, 'Đăng ký thất bại: ' . json_encode($response['body'], JSON_UNESCAPED_UNICODE));
    return [
        'token' => $response['body']['accessToken'],
        'id' => $response['body']['user']['id'],
        'name' => $response['body']['user']['displayName'],
    ];
}

function zp_users(PDO $pdo, int $count, int $offset = 0): array
{
    $users = [];
    for ($index = 0; $index < $count; $index++) {
        $users[] = zp_register($pdo, sprintf('09%08d', 10000000 + $offset + $index));
    }
    return $users;
}

function zp_balance(PDO $pdo, string $userId): int
{
    $statement = $pdo->prepare('SELECT balance FROM users WHERE id = ?');
    $statement->execute([$userId]);
    return (int)$statement->fetchColumn();
}

function zp_set_balance(PDO $pdo, string $userId, int $balance): void
{
    $pdo->prepare('UPDATE users SET balance = ? WHERE id = ?')->execute([$balance, $userId]);
}

function zp_total_balance(PDO $pdo): int
{
    return (int)$pdo->query('SELECT COALESCE(SUM(balance), 0) FROM users')->fetchColumn();
}

function zp_room_row(PDO $pdo, string $code): ?array
{
    $statement = $pdo->prepare('SELECT * FROM game_rooms WHERE code = ?');
    $statement->execute([$code]);
    return $statement->fetch() ?: null;
}

// Nộp bài tự xếp cho người chơi (dùng zingplayAutoArrange trên bài trong snapshot).
function zp_submit_auto(PDO $pdo, array $user, string $code): array
{
    $snapshot = zp_api($pdo, 'GET', '/rooms/' . $code, $user['token']);
    check($snapshot['status'] === 200, 'Không đọc được snapshot để nộp bài.');
    return zp_api($pdo, 'POST', '/rooms/' . $code . '/submit', $user['token'], [
        'arrangement' => count($snapshot['body']['cards']) === 13 ? zingplayAutoArrange($snapshot['body']['cards']) : null,
    ]);
}

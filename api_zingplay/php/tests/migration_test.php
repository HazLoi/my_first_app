<?php
declare(strict_types=1);

// Kiểm thử SQL trên MariaDB/MySQL thật: schema.sql và migrate_realtime.sql chạy lại nhiều lần được,
// và migration nâng cấp đúng database của phiên bản trước (schema_v1.sql) mà không mất dữ liệu.
// Cần ZP_MYSQL_DSN (xem harness.php); không có thì bỏ qua.

require_once __DIR__ . '/harness.php';

if (zp_driver() !== 'mysql') {
    echo "Bỏ qua kiểm thử migration (cần MariaDB: đặt ZP_MYSQL_DSN).\n";
    exit(0);
}

$root = dirname(__DIR__, 2);
$columns = static function (PDO $pdo): array {
    $rows = $pdo->query(
        'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION',
    )->fetchAll();
    $map = [];
    foreach ($rows as $row) {
        $map[$row['TABLE_NAME']][] = $row['COLUMN_NAME'];
    }
    return $map;
};
$required = [
    'game_rooms' => ['auto_play', 'max_players', 'password_hash', 'phase', 'phase_started_at', 'phase_deadline', 'version',
        'round_no', 'seed', 'last_activity'],
    'game_room_players' => ['last_seen', 'left_round'],
    'matches' => ['seed', 'round_no'],
];
$assertColumns = static function (array $actual, string $label) use ($required): void {
    foreach ($required as $table => $names) {
        foreach ($names as $name) {
            check(in_array($name, $actual[$table] ?? [], true), "$label: thiếu cột $table.$name");
        }
    }
};

// 1. Database mới từ schema.sql, chạy lại lần hai không lỗi và không đổi cấu trúc.
$pdo = zp_fresh_database();
$fresh = $columns($pdo);
$assertColumns($fresh, 'schema.sql mới');
zp_run_sql_file($pdo, $root . '/schema.sql');
check($columns($pdo) === $fresh, 'schema.sql chạy lại làm đổi cấu trúc.');

// 2. Database cũ (v1) có dữ liệu: migrate_realtime.sql thêm cột, giữ dữ liệu, chạy lại được.
zp_mysql_drop_all($pdo);
zp_run_sql_file($pdo, __DIR__ . '/schema_v1.sql');
$before = $columns($pdo);
check(!in_array('auto_play', $before['game_rooms'], true), 'Fixture v1 không được có cột auto_play.');
$pdo->exec("INSERT INTO users (id, phone, display_name, password_salt, password_hash, balance)
            VALUES ('11111111-1111-4111-8111-111111111111', '+84900000001', 'Cũ', 'salt', 'hash', 5000)");
$pdo->exec("INSERT INTO game_rooms (code, host_player_id, status, is_public, stake)
            VALUES ('ABCDE', 'p1', 'waiting', 1, 100)");
$pdo->exec("INSERT INTO game_room_players (player_id, room_code, user_id, seat_number, display_name, hand_json)
            VALUES ('p1', 'ABCDE', '11111111-1111-4111-8111-111111111111', 1, 'Cũ', '[]')");
zp_run_sql_file($pdo, $root . '/migrate_realtime.sql');
$migrated = $columns($pdo);
$assertColumns($migrated, 'migrate_realtime.sql');
zp_run_sql_file($pdo, $root . '/migrate_realtime.sql');
check($columns($pdo) === $migrated, 'migrate_realtime.sql chạy lại làm đổi cấu trúc.');
$room = $pdo->query("SELECT * FROM game_rooms WHERE code = 'ABCDE'")->fetch();
check($room['stake'] === 100 && (int)$room['auto_play'] === 0 && (int)$room['max_players'] === 4 && $room['phase'] === 'waiting'
    && (int)$room['version'] === 0 && $room['password_hash'] === null && $room['phase_deadline'] === null, 'Dữ liệu phòng cũ phải được giữ và có giá trị mặc định.');
$player = $pdo->query("SELECT * FROM game_room_players WHERE player_id = 'p1'")->fetch();
check((int)$player['left_round'] === 0 && (int)$player['last_seen'] === 0, 'Người chơi cũ có giá trị mặc định.');

// 3. schema.sql mới trên database v1 cho cùng kết quả cấu trúc cột như database mới.
zp_run_sql_file($pdo, $root . '/schema.sql');
foreach ($fresh as $table => $names) {
    $actual = $columns($pdo)[$table] ?? [];
    check(array_diff($names, $actual) === [], "schema.sql trên DB cũ vẫn thiếu cột ở bảng $table.");
}
check((int)$pdo->query('SELECT balance FROM users')->fetchColumn() === 5000, 'Migration không được đổi số dư.');

// 4. API chạy được trên DB đã migrate: đăng ký, tạo phòng thời gian thực.
$GLOBALS['ZINGPLAY_CONFIG'] = [];
zp_set_time(time());
$user = zp_register($pdo, '0912121212');
$created = zp_api($pdo, 'POST', '/rooms', $user['token'], ['autoPlay' => true]);
check($created['status'] === 201 && $created['body']['room']['autoPlay'] === true, 'API không chạy được trên DB đã migrate.');

zp_mysql_drop_all($pdo);
echo "Kiểm thử migration MariaDB đạt.\n";

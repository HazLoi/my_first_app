<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/bootstrap.php';

$phoneInput = $argv[1] ?? readline('Số điện thoại tài khoản: ');
$phone = normalize_phone($phoneInput);
if ($phone === null) {
    fwrite(STDERR, "Số điện thoại không hợp lệ.\n");
    exit(1);
}
$password = readline('Mật khẩu mới (tối đa 128 byte): ');
if (!valid_password($password)) {
    fwrite(STDERR, "Mật khẩu không được để trống và không quá 128 byte.\n");
    exit(1);
}
$confirmation = readline('Nhập lại mật khẩu mới: ');
if (!hash_equals($password, $confirmation)) {
    fwrite(STDERR, "Hai mật khẩu không khớp.\n");
    exit(1);
}

$pdo = database();
$update = $pdo->prepare(
    'UPDATE users
        SET password_salt = ?, password_hash = ?
      WHERE phone = ?',
);
$update->execute([bin2hex(random_bytes(16)), password_hash($password, PASSWORD_DEFAULT), $phone]);
if ($update->rowCount() !== 1) {
    fwrite(STDERR, "Không tìm thấy tài khoản hoặc mật khẩu không thay đổi.\n");
    exit(1);
}
$revoke = $pdo->prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE phone = ?)');
$revoke->execute([$phone]);
fwrite(STDOUT, "Đã đặt lại mật khẩu và thu hồi phiên đăng nhập hiện tại.\n");

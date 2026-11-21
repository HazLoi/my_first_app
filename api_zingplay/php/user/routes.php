<?php
declare(strict_types=1);

function handle_user_routes(string $route, string $method, PDO $pdo): void
{
    if ($route === '/auth/register' && $method === 'POST') {
        $body = json_body();
        $phone = normalize_phone($body['phone'] ?? null);
        if ($phone === null) {
            throw new ApiException(400, 'Số điện thoại cần có mã quốc gia và 8–15 chữ số.');
        }
        if (!valid_password($body['password'] ?? null)) {
            throw new ApiException(400, 'Mật khẩu không được để trống và không quá 128 byte.');
        }
        $name = $body['displayName'] ?? '';
        if (!is_string($name)) {
            throw new ApiException(400, 'Tên hiển thị không hợp lệ.');
        }
        $name = trim($name);
        $nameLength = preg_match_all('/./us', $name);
        if ($nameLength === false || $nameLength > 20) {
            throw new ApiException(400, 'Tên hiển thị tối đa 20 ký tự.');
        }
        $userId = new_id();
        $displayName = $name !== '' ? $name : 'Người chơi ' . strtoupper(substr($userId, 0, 4));
        $statement = $pdo->prepare(
            'INSERT INTO users (id, phone, display_name, password_salt, password_hash, balance)
             VALUES (?, ?, ?, ?, ?, ?)',
        );
        $pdo->beginTransaction();
        try {
            $statement->execute([
                $userId,
                $phone,
                $displayName,
                bin2hex(random_bytes(16)),
                password_hash($body['password'], PASSWORD_DEFAULT),
                SIGNUP_BONUS,
            ]);
            record_wallet_transaction($pdo, $userId, 'signup_bonus', SIGNUP_BONUS, SIGNUP_BONUS, null, null, 'Quà đăng ký');
            $pdo->commit();
        } catch (PDOException $exception) {
            $pdo->rollBack();
            if ($exception->getCode() === '23000') {
                throw new ApiException(409, 'Số điện thoại này đã được đăng ký.');
            }
            throw $exception;
        }
        respond(201, [...create_session($pdo, $userId), 'user' => [
            'id' => $userId,
            'phone' => $phone,
            'displayName' => $displayName,
            'role' => 'player',
            'balance' => SIGNUP_BONUS,
        ]]);
    }

    if ($route === '/auth/login' && $method === 'POST') {
        $body = json_body();
        $phone = normalize_phone($body['phone'] ?? null);
        if ($phone === null || !valid_password($body['password'] ?? null)) {
            throw new ApiException(400, 'Số điện thoại hoặc mật khẩu không hợp lệ.');
        }
        $statement = $pdo->prepare(
            'SELECT id, phone, display_name, password_hash, role, status, balance
               FROM users WHERE phone = ? LIMIT 1',
        );
        $statement->execute([$phone]);
        $user = $statement->fetch();
        if ($user && !str_starts_with($user['password_hash'], '$')) {
            throw new ApiException(
                409,
                'Tài khoản này dùng hash mật khẩu của backend Node.js cũ. Hãy đặt lại mật khẩu trước khi đăng nhập.',
            );
        }
        if (!$user || !password_verify($body['password'], $user['password_hash'])) {
            throw new ApiException(401, 'Số điện thoại hoặc mật khẩu không đúng.');
        }
        if ($user['status'] !== 'active') {
            throw new ApiException(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $update = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
            $update->execute([password_hash($body['password'], PASSWORD_DEFAULT), $user['id']]);
        }
        respond(200, [...create_session($pdo, $user['id']), 'user' => public_user($user)]);
    }

    if ($route === '/auth/me' && $method === 'GET') {
        respond(200, ['user' => public_user(require_user($pdo))]);
    }

    if ($route === '/auth/logout' && $method === 'POST') {
        $token = bearer_token();
        if ($token !== null) {
            $statement = $pdo->prepare('DELETE FROM sessions WHERE token_hash = ?');
            $statement->execute([hash('sha256', $token)]);
        }
        respond(200, ['status' => 'ok']);
    }

}

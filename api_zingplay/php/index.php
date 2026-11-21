<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function route_request(): never
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptDirectory = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    if ($scriptDirectory !== '' && $scriptDirectory !== '.'
        && ($path === $scriptDirectory || str_starts_with($path, $scriptDirectory . '/'))) {
        $route = substr($path, strlen($scriptDirectory)) ?: '/';
    } elseif (preg_match('~(?:^|/)api_zingplay(?=/|$)~', $path, $apiMatch, PREG_OFFSET_CAPTURE) === 1) {
        $route = substr($path, $apiMatch[0][1] + strlen($apiMatch[0][0])) ?: '/';
    } else {
        $route = $path;
    }
    if ($route === '/index.php') {
        $route = '/';
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $isLocalOrigin = preg_match('~^https?://(localhost|127\.0\.0\.1)(:\d+)?$~', $origin) === 1;
    if ($origin !== '' && $isLocalOrigin) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Max-Age: 600');
        header('Vary: Origin');
    } elseif ($origin !== '' && $origin !== ($_SERVER['HTTP_HOST'] ?? '')) {
        $expectedOrigin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://')
            . ($_SERVER['HTTP_HOST'] ?? '');
        if (!hash_equals($expectedOrigin, $origin)) {
            throw new ApiException(403, 'Origin không được phép.');
        }
    }
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    if ($route === '/health' && $method === 'GET') {
        try {
            $pdo = database();
            $pdo->query('SELECT 1');
        } catch (Throwable $exception) {
            error_log('ZingPlay PHP health check thất bại: ' . $exception->getMessage());
            respond(503, [
                'status' => 'error',
                'service' => 'api_zingplay_php',
                'database' => 'unavailable',
            ]);
        }
        respond(200, ['status' => 'ok', 'service' => 'api_zingplay_php', 'database' => 'ok']);
    }
    $pdo = database();
    // Poll trạng thái phòng (GET /rooms/{code}) phải nhẹ nên không dọn phòng ở đây.
    $isRoomPoll = $method === 'GET' && preg_match('~^/rooms/[A-Z2-9]{5}$~', $route) === 1;
    if (($route === '/rooms' || str_starts_with($route, '/rooms/')) && !$isRoomPoll) {
        cleanup_rooms($pdo);
    }

    handle_user_routes($route, $method, $pdo);
    handle_match_routes($route, $method, $pdo);
    handle_room_routes($route, $method, $pdo);
    handle_admin_routes($route, $method, $pdo);

    throw new ApiException(404, 'Không tìm thấy API.');
}

try {
    route_request();
} catch (ApiException $exception) {
    respond($exception->status, ['error' => $exception->getMessage()]);
} catch (Throwable $exception) {
    error_log('ZingPlay PHP API error: ' . $exception->getMessage());
    $status = str_contains($exception->getMessage(), 'config.php') ? 503 : 500;
    respond($status, [
        'error' => $status === 503
            ? $exception->getMessage()
            : server_error_message($exception),
    ]);
}

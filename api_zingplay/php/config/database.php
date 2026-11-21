<?php
declare(strict_types=1);

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        $configPath = dirname(__DIR__) . '/config.php';
    }
    if (!is_file($configPath)) {
        throw new RuntimeException('Thiếu config/config.php. Hãy sao chép config/config.example.php và nhập thông tin database.');
    }
    $config = require $configPath;
    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $key) {
        if (!isset($config[$key]) || $config[$key] === '' || str_starts_with((string)$config[$key], 'YOUR_')
            || $config[$key] === 'CHANGE_THIS_PASSWORD') {
            throw new RuntimeException('Cấu hình database chưa đầy đủ.');
        }
    }
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        (int)($config['db_port'] ?? 3306),
        $config['db_name'],
    );
    $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

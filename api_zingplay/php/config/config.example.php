<?php
declare(strict_types=1);

return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'adzuoqpv_zingplay',
    'db_user' => 'YOUR_DATABASE_USER',
    'db_password' => 'CHANGE_THIS_PASSWORD',
    'gameplay' => [
        'auto_topup_below' => 50,
        'auto_topup_to' => 10000,
        'room_player_idle_seconds' => 45,
        'empty_room_retention_seconds' => 30,
        'room_cleanup_interval_seconds' => 10,
        'room_cleanup_batch_size' => 50,
        'history_retention_count' => 300,
        'history_retention_days' => 90,
        'history_round_limit' => 40,
        'history_page_size' => 20,
    ],
];

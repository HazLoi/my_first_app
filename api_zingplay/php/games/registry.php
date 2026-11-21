<?php
declare(strict_types=1);

require_once __DIR__ . '/XapXamEngine.php';
require_once __DIR__ . '/tienlen/TienLenEngine.php';

function game_engine_registry(Closure $xapxamActionHandler): array
{
    return [
        'xapxam' => new XapXamEngine($xapxamActionHandler),
        'tienlen' => new TienLenEngine(),
    ];
}

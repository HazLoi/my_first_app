<?php
declare(strict_types=1);

require_once __DIR__ . '/GameEngine.php';

final class XapXamEngine implements GameEngine
{
    public function __construct(private readonly Closure $applyLegacyAction)
    {
    }

    public function id(): string
    {
        return 'xapxam';
    }

    public function minPlayers(): int
    {
        return 2;
    }

    public function maxPlayers(): int
    {
        return 4;
    }

    public function startRound(PDO $pdo, array &$table, array &$players, int $now): bool
    {
        return zingplay_start_round($pdo, $table, $players, $now);
    }

    public function applyAction(PDO $pdo, array &$table, array &$players, array $user, array $action, int $now): void
    {
        ($this->applyLegacyAction)($pdo, $table, $players, $user, $action, $now);
    }

    public function advanceIfDue(PDO $pdo, array $table): bool
    {
        return zingplay_advance_if_due($pdo, (string)$table['code'], $table);
    }

    public function viewFor(PDO $pdo, array $user, string $code): array
    {
        return room_snapshot($pdo, $user, $code);
    }

    public function settle(PDO $pdo, array &$table, array &$players, int $now): array
    {
        zingplay_finish_round($pdo, $table, $players, $now);
        $results = decode_json($table['results_json'] ?? null);
        if (!is_array($results)) {
            throw new LogicException('Xập Xám không trả về kết quả thanh toán.');
        }
        return $results;
    }
}

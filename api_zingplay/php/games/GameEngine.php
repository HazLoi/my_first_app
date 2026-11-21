<?php
declare(strict_types=1);

interface GameEngine
{
    public function id(): string;
    public function minPlayers(): int;
    public function maxPlayers(): int;
    public function startRound(PDO $pdo, array &$table, array &$players, int $now): bool;
    public function applyAction(PDO $pdo, array &$table, array &$players, array $user, array $action, int $now): void;
    public function advanceIfDue(PDO $pdo, array $table): bool;
    public function viewFor(PDO $pdo, array $user, string $code): array;
    public function settle(PDO $pdo, array &$table, array &$players, int $now): array;
}

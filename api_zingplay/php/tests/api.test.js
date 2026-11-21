"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFileSync } = require("node:child_process");

test("database configuration prefers config directory and supports the legacy path", (t) => {
  const temp = fs.mkdtempSync(path.join(__dirname, ".tmp-config-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const directory = path.join(temp, "config");
  fs.mkdirSync(directory);
  const database = path.join(directory, "database.php");
  fs.copyFileSync(path.resolve(__dirname, "../config/database.php"), database);
  const load = () => execFileSync("php", [
    "-r",
    "require $argv[1]; try { database(); } catch (Throwable $e) { echo $e->getMessage(); }",
    database,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  assert.match(load(), /Thiếu config\/config\.php/);
  fs.writeFileSync(path.join(temp, "config.php"), "<?php throw new RuntimeException('legacy');");
  assert.equal(load(), "legacy");
  fs.writeFileSync(path.join(directory, "config.php"), "<?php throw new RuntimeException('new');");
  assert.equal(load(), "new");
});

test("public room listing excludes private, full and non-realtime started rooms", () => {
  const bootstrap = path.resolve(__dirname, "../bootstrap.php");
  const output = execFileSync("php", ["-r", `
    require $argv[1];
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->sqliteCreateFunction('UTC_TIMESTAMP', fn() => '2026-01-01 00:00:00');
    $pdo->exec("CREATE TABLE users (id TEXT, phone TEXT, display_name TEXT, role TEXT, status TEXT, balance INTEGER);
      CREATE TABLE sessions (token_hash TEXT, user_id TEXT, expires_at TEXT);
      CREATE TABLE game_rooms (code TEXT, host_player_id TEXT, status TEXT, is_public INTEGER, stake INTEGER, created_at TEXT,
        game_type TEXT NOT NULL DEFAULT 'xapxam', max_players INTEGER DEFAULT 4, password_hash TEXT,
        phase TEXT DEFAULT 'waiting', auto_play INTEGER DEFAULT 0, round_no INTEGER DEFAULT 0);
      CREATE TABLE game_room_players (player_id TEXT, room_code TEXT, display_name TEXT, left_round INTEGER DEFAULT 0);
      INSERT INTO users VALUES ('u', 'phone', 'User', 'player', 'active', 0);
      INSERT INTO sessions VALUES ('" . hash('sha256', str_repeat('a', 43)) . "', 'u', '2099-01-01');
      INSERT INTO game_rooms (code, host_player_id, status, is_public, stake, created_at, max_players, password_hash, phase, auto_play, round_no) VALUES
        ('AAAAA', 'p1', 'waiting', 1, 200, '2026-01-01', 4, NULL, 'waiting', 0, 0),
        ('BBBBB', 'p2', 'waiting', 0, 50, '2026-01-01', 4, NULL, 'waiting', 0, 0),
        ('CCCCC', 'p3', 'playing', 1, 50, '2026-01-01', 4, NULL, 'arranging', 0, 0),
        ('DDDDD', 'p4', 'waiting', 1, 50, '2026-01-01', 4, NULL, 'waiting', 0, 0),
        ('EEEEE', 'p8', 'playing', 1, 100, '2026-01-02', 3, 'hash', 'summary', 1, 4),
        ('FFFFF', 'p10', 'playing', 1, 100, '2026-01-02', 2, NULL, 'arranging', 1, 1);
      INSERT INTO game_room_players (player_id, room_code, display_name, left_round) VALUES ('p1','AAAAA','Host',0),
        ('p2','BBBBB','Private',0), ('p3','CCCCC','Playing',0),
        ('p4','DDDDD','Full',0), ('p5','DDDDD','A',0), ('p6','DDDDD','B',0), ('p7','DDDDD','C',0),
        ('p8','EEEEE','Realtime',0), ('p9','EEEEE','Ghost',1),
        ('p10','FFFFF','Duo',0), ('p11','FFFFF','Duo2',0)");
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . str_repeat('a', 43);
    $GLOBALS['ZINGPLAY_NOW'] = 1;
    handle_room_routes('/rooms', 'GET', $pdo);
  `, bootstrap], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.deepEqual(JSON.parse(output), { rooms: [
    { code: "EEEEE", hostName: "Realtime", playerCount: 1, stake: 100, maxPlayers: 3, hasPassword: true, phase: "summary", autoPlay: true, round: 4 },
    { code: "AAAAA", hostName: "Host", playerCount: 1, stake: 200, maxPlayers: 4, hasPassword: false, phase: "waiting", autoPlay: false, round: 0 },
  ] });
});

test("auth, wallet and admin routes", async (t) => {
  const root = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(__dirname, ".tmp-api-"));
  for (const name of ["index.php", "bootstrap.php", "router.php", "rules.php", "phase.php", "user", "room", "match", "admin_api", "games"]) {
    fs.cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
  }
  fs.mkdirSync(path.join(temp, "config"));
  fs.copyFileSync(path.join(root, "config", "games.php"), path.join(temp, "config", "games.php"));
  fs.writeFileSync(path.join(temp, "config", "database.php"), `<?php
function database(): PDO {
    $pdo = new PDO('sqlite:' . __DIR__ . '/test.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->sqliteCreateFunction('UTC_TIMESTAMP', fn() => gmdate('Y-m-d H:i:s'));
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, display_name TEXT, password_salt TEXT, password_hash TEXT, role TEXT NOT NULL DEFAULT 'player', status TEXT NOT NULL DEFAULT 'active', balance INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    $pdo->exec('CREATE TABLE IF NOT EXISTS wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, match_id TEXT, admin_id TEXT, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS game_rooms (code TEXT PRIMARY KEY, status TEXT, stake INTEGER)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, room_code TEXT, player_count INTEGER, stake INTEGER, finished_at TEXT)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS match_players (match_id TEXT, seat_number INTEGER, display_name TEXT, points INTEGER, chip_delta INTEGER)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT)');
    return $pdo;
}
`);
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));

  const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", temp, path.join(temp, "router.php")], {
    stdio: "ignore",
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}/api_zingplay`;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`${base}/health`);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.ok(ready, "PHP test server did not start");
  const request = async (route, options = {}) => {
    const response = await fetch(`${base}${route}`, options);
    return { status: response.status, body: await response.json() };
  };
  const post = (body, token) => ({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const account = { phone: "0912345678", password: "a", displayName: "  Người chơi An  " };
  const registered = await request("/auth/register", post(account));
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.phone, "+84912345678");
  assert.equal(registered.body.user.displayName, "Người chơi An");
  assert.equal((await request("/auth/register", post({ phone: "0912345670", password: "a", displayName: "a".repeat(21) }))).status, 400);
  assert.equal((await request("/auth/register", post({ phone: "0912345670", password: "a", displayName: 123 }))).status, 400);
  assert.ok(registered.body.accessToken);
  assert.equal((await request("/auth/register", post(account))).status, 409);

  const login = await request("/auth/login", post(account));
  assert.equal(login.status, 200);
  const token = login.body.accessToken;
  const me = await request("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.phone, "+84912345678");
  assert.equal(me.body.user.displayName, "Người chơi An");
  assert.equal((await request("/auth/logout", post({}, token))).status, 200);
  assert.equal((await request("/auth/me", { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  assert.equal((await request("/matches")).status, 401);
  assert.equal((await request("/not-found")).status, 404);

  assert.equal(registered.body.user.balance, 10000);
  assert.equal(me.body.user.balance, 10000);
  assert.equal(me.body.user.role, "player");
  const auth = (accessToken) => ({ headers: { Authorization: `Bearer ${accessToken}` } });
  const second = await request("/auth/register", post({ phone: "0987654321", password: "b" }));
  const secondToken = second.body.accessToken;
  const secondId = second.body.user.id;
  assert.equal((await request("/admin/stats", auth(secondToken))).status, 403);

  execFileSync("php", ["-r",
    "(new PDO('sqlite:' . $argv[1]))->exec(\"UPDATE users SET role = 'admin' WHERE phone = '+84912345678'\");",
    path.join(temp, "config", "test.sqlite"),
  ], { stdio: ["ignore", "ignore", "ignore"] });
  const adminToken = (await request("/auth/login", post(account))).body.accessToken;
  const stats = await request("/admin/stats", auth(adminToken));
  assert.equal(stats.status, 200);
  assert.equal(stats.body.stats.users, 2);
  assert.equal(stats.body.stats.totalBalance, 20000);

  const found = await request("/admin/users?search=87654321", auth(adminToken));
  assert.deepEqual(found.body.users.map((user) => user.id), [secondId]);
  const credit = await request(`/admin/users/${secondId}/credit`, post({ amount: 500, note: "Thưởng" }, adminToken));
  assert.equal(credit.body.user.balance, 10500);
  assert.equal((await request(`/admin/users/${secondId}/credit`, post({ amount: 0 }, adminToken))).status, 400);
  assert.equal((await request(`/admin/users/${secondId}/credit`, post({ amount: 1.5 }, adminToken))).status, 400);
  assert.equal((await request(`/admin/users/${secondId}/debit`, post({ amount: 99999 }, adminToken))).status, 409);
  assert.equal((await request(`/admin/users/${secondId}/debit`, post({ amount: 100 }, adminToken))).body.user.balance, 10400);
  assert.equal((await request(`/admin/users/${secondId}/credit`, post({ amount: 5 }, secondToken))).status, 403);
  const ledger = await request(`/admin/transactions?userId=${secondId}`, auth(adminToken));
  assert.deepEqual(
    ledger.body.transactions.map((row) => [row.type, row.amount, row.balanceAfter]),
    [["admin_debit", -100, 10400], ["admin_credit", 500, 10500], ["signup_bonus", 10000, 10000]],
  );
  assert.equal(ledger.body.transactions[0].adminPhone, "+84912345678");

  const adminId = registered.body.user.id;
  assert.equal((await request(`/admin/users/${adminId}/status`, post({ status: "locked" }, adminToken))).status, 409);
  assert.equal((await request(`/admin/users/${secondId}/status`, post({ status: "locked" }, adminToken))).body.user.status, "locked");
  assert.equal((await request("/auth/me", auth(secondToken))).status, 401);
  assert.equal((await request("/auth/login", post({ phone: "0987654321", password: "b" }))).status, 403);
  assert.equal((await request(`/admin/users/${secondId}/status`, post({ status: "active" }, adminToken))).body.user.status, "active");
  assert.equal((await request("/auth/login", post({ phone: "0987654321", password: "b" }))).status, 200);
});

test("match settlement moves chips, records the ledger and caps losses at the balance", () => {
  const bootstrap = path.resolve(__dirname, "../bootstrap.php");
  const output = execFileSync("php", ["-r", `
    require $argv[1];
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec("CREATE TABLE users (id TEXT, balance INTEGER);
      CREATE TABLE wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, type TEXT, amount INTEGER,
        balance_after INTEGER, match_id TEXT, admin_id TEXT, note TEXT);
      INSERT INTO users VALUES ('ua', 1000), ('ub', 1000), ('uc', 30)");
    $players = [['player_id' => 'a', 'user_id' => 'ua'], ['player_id' => 'b', 'user_id' => 'ub'], ['player_id' => 'c', 'user_id' => 'uc']];
    $results = settle_match_chips($pdo, $players, [
      ['id' => 'a', 'points' => 6], ['id' => 'b', 'points' => 2], ['id' => 'c', 'points' => -8],
    ], 50, 'match-1');
    echo json_encode([
      array_map(fn($r) => [$r['chips'], $r['balanceAfter']], $results),
      $pdo->query('SELECT id, balance FROM users ORDER BY id')->fetchAll(),
      (int)$pdo->query('SELECT COUNT(*) FROM wallet_transactions')->fetchColumn(),
    ]);
  `, bootstrap], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const [chips, balances, ledgerRows] = JSON.parse(output);
  assert.deepEqual(chips, [[23, 1023], [7, 1007], [-30, 0]]);
  assert.deepEqual(balances.map((row) => row.balance), [1023, 1007, 0]);
  assert.equal(ledgerRows, 3);
});

test("realtime room over HTTP: changed:false, long poll wakes on version change, auto start", async (t) => {
  const root = path.resolve(__dirname, "..");
  const temp = fs.mkdtempSync(path.join(__dirname, ".tmp-realtime-"));
  for (const name of ["index.php", "bootstrap.php", "router.php", "rules.php", "phase.php", "user", "room", "match", "admin_api"]) {
    fs.cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
  }
  const schema = execFileSync("php", ["-r", "require $argv[1]; echo zp_sqlite_schema();", path.join(__dirname, "harness.php")], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  fs.mkdirSync(path.join(temp, "config"));
  fs.writeFileSync(path.join(temp, "schema.sql"), schema);
  fs.writeFileSync(path.join(temp, "config", "config.php"), "<?php return ['long_poll' => true, 'phase_seconds' => ['auto_start' => 1, 'dealing' => 1]];");
  fs.writeFileSync(path.join(temp, "config", "database.php"), `<?php
function database(): PDO {
    $file = __DIR__ . '/realtime.sqlite';
    $fresh = !is_file($file);
    $pdo = new PDO('sqlite:' . $file);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->sqliteCreateFunction('UTC_TIMESTAMP', fn() => gmdate('Y-m-d H:i:s'));
    if ($fresh) {
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec(file_get_contents(dirname(__DIR__) . '/schema.sql'));
    }
    $pdo->exec('PRAGMA foreign_keys = ON');
    return $pdo;
}
`);
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const server = spawn("php", ["-S", `127.0.0.1:${port}`, "-t", temp, path.join(temp, "router.php")], {
    stdio: "ignore",
    env: { ...process.env, PHP_CLI_SERVER_WORKERS: "4" },
  });
  t.after(async () => {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}/api_zingplay`;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`${base}/health`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  const call = async (route, token, body) => {
    const response = await fetch(`${base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const a = (await call("/auth/register", null, { phone: "0911000001", password: "a" })).body.accessToken;
  const b = (await call("/auth/register", null, { phone: "0911000002", password: "a" })).body.accessToken;
  const created = await call("/rooms", a, { autoPlay: true, maxPlayers: 2, isPublic: true });
  assert.equal(created.status, 201);
  const code = created.body.room.code;
  const first = await call(`/rooms/${code}`, a);
  assert.equal(first.body.room.phase, "waiting");
  assert.equal(typeof first.body.serverTime, "number");
  const unchanged = await call(`/rooms/${code}?since_version=${first.body.version}`, a);
  assert.deepEqual(Object.keys(unchanged.body).sort(), ["changed", "serverTime", "version"]);
  assert.equal(unchanged.body.changed, false);

  const waiting = call(`/rooms/${code}?since_version=${first.body.version}&wait=1`, a);
  await new Promise((resolve) => setTimeout(resolve, 600));
  const startedAt = Date.now();
  assert.equal((await call("/rooms/join", b, { code })).status, 200);
  const woken = await waiting;
  assert.ok(Date.now() - startedAt < 3000, "long poll should return soon after the version changes");
  assert.equal(woken.status, 200);
  assert.ok(woken.body.version > first.body.version);
  assert.equal(woken.body.room.players.length, 2);

  // Đủ người: tự bắt đầu sau ~1s; máy bận có thể đã sang arranging trước khi nhận phản hồi.
  const dealt = await call(`/rooms/${code}?since_version=${woken.body.version}&wait=1`, a);
  assert.ok(["dealing", "arranging"].includes(dealt.body.room.phase));
  assert.equal(dealt.body.room.round, 1);
  assert.ok(dealt.body.version > woken.body.version);
  assert.equal(dealt.body.cards.length, 13);
  assert.equal(dealt.body.results, null);
  const other = await call(`/rooms/${code}`, b);
  assert.equal(other.body.cards.length, 13);
  assert.equal(other.body.room.players.length, 2);
  assert.notDeepEqual(other.body.cards, dealt.body.cards);
});

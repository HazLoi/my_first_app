# ZingPlay PHP API — Binh Xập Xám

The game backend uses PHP 8.1+, PDO MySQL, and regular HTTP requests. It does
not require Node.js, npm, a WebSocket process, or a subdomain. Game rooms and
hands are stored in MySQL; the browser refreshes room state every 1.2 seconds.

## Local checks

Run the PHP rules tests and syntax checks:

```sh
php api_zingplay/php/tests/rules_test.php
find api_zingplay/php -name '*.php' -exec php -l {} \;
node --check web/zingplay/game.js
node --test api_zingplay/php/tests/api.test.js web/zingplay/game.test.js
```

The HTTP auth test uses a temporary SQLite database and requires PHP's
`pdo_sqlite` extension; production still requires MySQL.

For a local API server, copy `php/config/config.example.php` to
`php/config/config.php`, set the database connection values, then run:

```sh
php -S 127.0.0.1:8787 -t api_zingplay/php api_zingplay/php/router.php
```

The local API health endpoint is
`http://127.0.0.1:8787/api_zingplay/health`. On hosting, the API is deployed
directly at `/api_zingplay/`. PHP needs the PDO MySQL extension (`pdo_mysql`)
enabled.

## Hosting deployment

Extract `zingplay-web-php-upload.zip` into `public_html/zingplay/`, including
its hidden `.htaccess`. Apache must allow `.htaccess` and enable `mod_headers`
for the cache headers to take effect. After deployment, browsers that already
cached the old page may need a hard reload or cleared site data once.

Upload the contents of `php/` into the existing
`public_html/api_zingplay/` directory, then copy `config/config.example.php` to
`config/config.php` and enter the MySQL host, database name, username, and
password. An existing root-level `config.php` remains supported if
`config/config.php` does not exist; the new location takes precedence.
The directory's `.htaccess` routes requests to `index.php` and blocks direct
access to configuration and internal PHP files. `bootstrap.php` loads the
shared code; `user/`, `room/`, and `match/` contain the route handlers.

Import the current `schema.sql` into the game database. It creates missing tables
and adds missing columns to existing tables, including the wallet, public-room
and realtime fields. Back up the database before upgrading. Existing rooms
remain private. New rooms are private unless their creator opts to show them
in the lobby.
The backend uses only PHP's PDO MySQL driver and does not need Composer packages.

See [`HUONG_DAN_KET_NOI_DATABASE_GAME_ONLINE.md`](../HUONG_DAN_KET_NOI_DATABASE_GAME_ONLINE.md)
for cPanel steps and the account migration note.

## API routes

- `GET /health`
- `POST /auth/register`, `POST /auth/login`
- `GET /auth/me`, `POST /auth/logout`
- `GET /matches?limit=20`
- `GET /rooms` (authenticated public waiting rooms), `POST /rooms`
  (`isPublic` defaults to false, `stake` is one of 50/100/200/500/1000 and defaults to 50), `POST /rooms/join`
- `GET /rooms/{code}`
- `POST /rooms/{code}/start`, `/submit`, `/leave`
- Admin only (`users.role = 'admin'`): `GET /admin/stats`, `/admin/users?search=`,
  `/admin/transactions?userId=`, `/admin/matches`;
  `POST /admin/users/{id}/credit`, `/debit` (`{amount, note}`) and `/status`
  (`{status: "active"|"locked"}`)

The hosting URLs use the `/api_zingplay` prefix, for example
`https://blastbaal.id.vn/api_zingplay/health`. The local server uses
`/api_zingplay/health`.

The browser sends a bearer token in the `Authorization` header. Passwords for
new PHP accounts use `password_hash`; session tokens are random and only their
SHA-256 hashes are stored. Login is by password, not SMS OTP.
Registration accepts an optional `displayName` of at most 20 characters;
an empty or omitted name receives a generated name.

## Existing Node accounts

The previous Node backend used scrypt hashes, which PHP's standard password
verification cannot verify. Those hashes remain untouched in the database, but
affected accounts must have an administrator reset their password once using
`php reset_password.php +84...` from `public_html/api_zingplay/` on the hosting
Terminal. The helper is CLI-only, revokes the user's existing sessions, and
does not provide an unauthenticated web password-reset endpoint.

## Virtual chips and admin

New accounts receive 10,000 chips (`wallet_transactions` type `signup_bonus`).
Chips are virtual only. A room has a stake (chips per point); joining or
starting requires at least 20 × stake. When every player has submitted, the
server settles chips in the same transaction as the match: `points × stake`,
losers pay at most their balance and winners' gains are scaled so the ledger
stays balanced. Every balance change is a `wallet_transactions` row.

Admins are made with SQL only, never over HTTP:

```sql
UPDATE users SET role = 'admin' WHERE phone = '+84912345678';
```

The admin page is `web/zingplay/admin.html`. Locking an account revokes its
sessions and blocks login.

## Game rules

A 52-card deck, 13 cards per player, a three-card front pile, two five-card
piles and foul-hand (binh lủng) validation. Pairwise scoring per chi: a win is
worth 1 point, or more with a special winning hand — front three-of-a-kind 3;
middle full house 2, quads 8, straight flush 10; back quads 4, straight flush 5.
Winning all three chi against one opponent (sập hầm) doubles that pair's total,
and sweeping every opponent with 3+ players (sập làng) doubles it again.
Do not send or trust client-calculated scores; PHP validates arrangements and
computes results on the server.

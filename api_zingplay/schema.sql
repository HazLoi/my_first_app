-- =====================================================================
-- ZingPlay - SQL DUY NHẤT cho database game (MySQL / MariaDB).
--
-- Chạy file này bao nhiêu lần cũng được, trên database mới hoặc database đã
-- có tài khoản:
--   * Bảng chưa có thì tạo (CREATE TABLE IF NOT EXISTS).
--   * Bảng đã có thì KHÔNG xóa, KHÔNG tạo lại; chỉ thêm cột còn thiếu
--     (phần "BỔ SUNG CỘT" bên dưới). Dữ liệu tài khoản, phiên, lịch sử giữ nguyên.
--   * Xu tặng cho tài khoản cũ chỉ được cấp một lần.
--
-- Khi cần thêm cột mới sau này: thêm cột vào CREATE TABLE tương ứng (cho
-- database mới) VÀ thêm một khối "BỔ SUNG CỘT" (cho database cũ). Không đổi
-- kiểu/xóa cột đang có dữ liệu.
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  phone VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  display_name VARCHAR(20) NOT NULL,
  password_salt CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('player', 'admin') NOT NULL DEFAULT 'player',
  status ENUM('active', 'locked') NOT NULL DEFAULT 'active',
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX sessions_user_id_idx (user_id),
  INDEX sessions_expires_at_idx (expires_at),
  CONSTRAINT sessions_user_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  room_code CHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  player_count TINYINT UNSIGNED NOT NULL,
  stake INT UNSIGNED NOT NULL DEFAULT 50,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NOT NULL,
  seed CHAR(32) NULL,
  round_no INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX matches_finished_at_idx (finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_players (
  match_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  seat_number TINYINT UNSIGNED NOT NULL,
  display_name VARCHAR(20) NOT NULL,
  points INT NOT NULL,
  chip_delta BIGINT NOT NULL DEFAULT 0,
  balance_after BIGINT NULL,
  hands_json JSON NOT NULL,
  chi_results_json JSON NOT NULL,
  PRIMARY KEY (match_id, user_id),
  UNIQUE KEY match_players_seat_idx (match_id, seat_number),
  INDEX match_players_user_match_idx (user_id, match_id),
  CONSTRAINT match_players_match_fk
    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT match_players_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_rooms (
  code CHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  host_player_id CHAR(36) NOT NULL,
  status ENUM('waiting', 'playing', 'finished', 'cancelled') NOT NULL DEFAULT 'waiting',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  stake INT UNSIGNED NOT NULL DEFAULT 50,
  game_type VARCHAR(20) NOT NULL DEFAULT 'xapxam',
  game_state MEDIUMTEXT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  results_json JSON NULL,
  cancel_message VARCHAR(255) NULL,
  auto_play BOOLEAN NOT NULL DEFAULT FALSE,
  max_players TINYINT UNSIGNED NOT NULL DEFAULT 4,
  password_hash VARCHAR(255) NULL,
  phase VARCHAR(12) NOT NULL DEFAULT 'waiting',
  phase_started_at BIGINT NOT NULL DEFAULT 0,
  phase_deadline BIGINT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  round_no INT UNSIGNED NOT NULL DEFAULT 0,
  seed CHAR(32) NULL,
  last_activity BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX game_rooms_status_created_idx (status, created_at),
  INDEX game_rooms_game_type_status_idx (game_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_room_players (
  player_id CHAR(36) NOT NULL PRIMARY KEY,
  room_code CHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) NOT NULL,
  seat_number TINYINT UNSIGNED NOT NULL,
  display_name VARCHAR(20) NOT NULL,
  hand_json JSON NOT NULL,
  arrangement_json JSON NULL,
  last_seen BIGINT NOT NULL DEFAULT 0,
  left_round BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY game_room_players_user_idx (room_code, user_id),
  UNIQUE KEY game_room_players_seat_idx (room_code, seat_number),
  INDEX game_room_players_user_room_idx (user_id, room_code),
  CONSTRAINT game_room_players_room_fk
    FOREIGN KEY (room_code) REFERENCES game_rooms (code) ON DELETE CASCADE,
  CONSTRAINT game_room_players_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type ENUM('admin_credit', 'admin_debit', 'match_result', 'signup_bonus') NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  match_id CHAR(36) NULL,
  admin_id CHAR(36) NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX wallet_transactions_user_idx (user_id, id),
  INDEX wallet_transactions_match_idx (match_id),
  CONSTRAINT wallet_transactions_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- BỔ SUNG CỘT cho bảng đã tồn tại từ phiên bản cũ (bỏ qua nếu cột đã có).
-- =====================================================================

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'),
  'DO 0',
  'ALTER TABLE users ADD COLUMN role ENUM(''player'', ''admin'') NOT NULL DEFAULT ''player''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status'),
  'DO 0',
  'ALTER TABLE users ADD COLUMN status ENUM(''active'', ''locked'') NOT NULL DEFAULT ''active''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'balance'),
  'DO 0',
  'ALTER TABLE users ADD COLUMN balance BIGINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'stake'),
  'DO 0',
  'ALTER TABLE matches ADD COLUMN stake INT UNSIGNED NOT NULL DEFAULT 50');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_players' AND COLUMN_NAME = 'chip_delta'),
  'DO 0',
  'ALTER TABLE match_players ADD COLUMN chip_delta BIGINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_players' AND COLUMN_NAME = 'balance_after'),
  'DO 0',
  'ALTER TABLE match_players ADD COLUMN balance_after BIGINT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'is_public'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'stake'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN stake INT UNSIGNED NOT NULL DEFAULT 50');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'game_type'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN game_type VARCHAR(20) NOT NULL DEFAULT ''xapxam''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'game_state'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN game_state MEDIUMTEXT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms'
            AND INDEX_NAME = 'game_rooms_game_type_status_idx'),
  'DO 0',
  'ALTER TABLE game_rooms ADD INDEX game_rooms_game_type_status_idx (game_type, status)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Mở rộng password_hash từ CHAR(128) lên VARCHAR(255) (chỉ nới rộng, không mất dữ liệu).
SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
            AND COLUMN_NAME = 'password_hash' AND DATA_TYPE = 'char'),
  'ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Cột cho phòng thời gian thực (ZingPlay v2); tương đương migrate_realtime.sql.

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'auto_play'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN auto_play BOOLEAN NOT NULL DEFAULT FALSE');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'max_players'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN max_players TINYINT UNSIGNED NOT NULL DEFAULT 4');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'password_hash'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN password_hash VARCHAR(255) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'phase'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN phase VARCHAR(12) NOT NULL DEFAULT ''waiting''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'phase_started_at'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN phase_started_at BIGINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'phase_deadline'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN phase_deadline BIGINT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'version'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'round_no'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN round_no INT UNSIGNED NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'seed'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN seed CHAR(32) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'last_activity'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN last_activity BIGINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_room_players' AND COLUMN_NAME = 'last_seen'),
  'DO 0',
  'ALTER TABLE game_room_players ADD COLUMN last_seen BIGINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_room_players' AND COLUMN_NAME = 'left_round'),
  'DO 0',
  'ALTER TABLE game_room_players ADD COLUMN left_round BOOLEAN NOT NULL DEFAULT FALSE');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'seed'),
  'DO 0',
  'ALTER TABLE matches ADD COLUMN seed CHAR(32) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'round_no'),
  'DO 0',
  'ALTER TABLE matches ADD COLUMN round_no INT UNSIGNED NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- TẶNG 10.000 XU cho tài khoản có từ trước khi có xu ảo (chỉ một lần).
-- Chỉ áp dụng cho tài khoản chưa có giao dịch xu nào và số dư đang là 0.
-- =====================================================================

INSERT INTO wallet_transactions (user_id, type, amount, balance_after, note)
  SELECT u.id, 'signup_bonus', 10000, 10000, 'Quà tài khoản hiện có'
  FROM users u
  WHERE u.balance = 0
    AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.user_id = u.id);

UPDATE users u SET u.balance = 10000
  WHERE u.balance = 0
    AND (SELECT COUNT(*) FROM wallet_transactions t WHERE t.user_id = u.id) = 1
    AND EXISTS (SELECT 1 FROM wallet_transactions t
                WHERE t.user_id = u.id AND t.type = 'signup_bonus'
                  AND t.note = 'Quà tài khoản hiện có');

-- Cấp quyền admin: bỏ dấu -- ở dòng dưới và thay bằng số điện thoại của bạn (+84...).
-- UPDATE users SET role = 'admin' WHERE phone = '+84912345678';

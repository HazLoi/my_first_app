-- =====================================================================
-- ZingPlay v2 (phòng thời gian thực) - MIGRATION cho database đã có.
--
-- Chạy file này SAU KHI đã chạy schema.sql của phiên bản trước; chạy lại bao
-- nhiêu lần cũng được (cột đã có thì bỏ qua, dữ liệu giữ nguyên).
-- Nếu import schema.sql mới nhất thì các cột này đã được thêm sẵn và không cần
-- chạy file này (chạy cũng không sao).
--
--   game_rooms: auto_play, max_players, password_hash, phase, phase_started_at,
--               phase_deadline, version, round_no, seed, last_activity, empty_since
--   game_room_players: last_seen, left_round
--   maintenance_meta: lazy cleanup throttle
--   matches: seed, round_no
-- Mọi thời điểm (phase_*, last_activity, last_seen) là unix giây UTC.
-- =====================================================================

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
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'empty_since'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN empty_since BIGINT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'scoring_mode'),
  'DO 0',
  "ALTER TABLE game_rooms ADD COLUMN scoring_mode ENUM('points','coins') NOT NULL DEFAULT 'coins'");
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'target_score'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN target_score SMALLINT UNSIGNED NOT NULL DEFAULT 20');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'scoring_config'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN scoring_config JSON NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_room_players' AND COLUMN_NAME = 'last_seen'),
  'DO 0',
  'ALTER TABLE game_room_players ADD COLUMN last_seen BIGINT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS maintenance_meta (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  last_room_cleanup BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO maintenance_meta (id, last_room_cleanup) VALUES (1, 0);

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_room_players' AND COLUMN_NAME = 'left_round'),
  'DO 0',
  'ALTER TABLE game_room_players ADD COLUMN left_round BOOLEAN NOT NULL DEFAULT FALSE');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_room_players'
            AND INDEX_NAME = 'game_room_players_room_seen_idx'),
  'DO 0',
  'ALTER TABLE game_room_players ADD INDEX game_room_players_room_seen_idx (room_code, left_round, last_seen)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE wallet_transactions
  MODIFY COLUMN type ENUM('admin_credit', 'admin_debit', 'match_result', 'signup_bonus', 'auto_topup') NOT NULL;

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

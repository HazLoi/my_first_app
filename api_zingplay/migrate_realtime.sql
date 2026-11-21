-- =====================================================================
-- ZingPlay v2 (phòng thời gian thực) - MIGRATION cho database đã có.
--
-- Chạy file này SAU KHI đã chạy schema.sql của phiên bản trước; chạy lại bao
-- nhiêu lần cũng được (cột đã có thì bỏ qua, dữ liệu giữ nguyên).
-- Nếu import schema.sql mới nhất thì các cột này đã được thêm sẵn và không cần
-- chạy file này (chạy cũng không sao).
--
--   game_rooms: auto_play, max_players, password_hash, phase, phase_started_at,
--               phase_deadline, version, round_no, seed, last_activity
--   game_room_players: last_seen, left_round
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

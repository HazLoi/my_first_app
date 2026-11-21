-- Game hub metadata for existing game_rooms. Safe to run repeatedly on MySQL/MariaDB.
-- Existing rooms become Xap Xam through the game_type default.

SET @ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_rooms' AND COLUMN_NAME = 'game_type'),
  'DO 0',
  'ALTER TABLE game_rooms ADD COLUMN game_type VARCHAR(20) NOT NULL DEFAULT ''xapxam''');
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

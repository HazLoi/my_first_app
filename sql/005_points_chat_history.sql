-- Chạy sql/004_game_hub.sql và api_zingplay/migrate_realtime.sql trước.
-- Chat và lịch sử. An toàn khi chạy lại trên MySQL/MariaDB.
CREATE TABLE IF NOT EXISTS table_chat (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  table_id CHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) NOT NULL,
  display_name VARCHAR(20) NOT NULL,
  text VARCHAR(200) NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX table_chat_table_id_idx (table_id, id),
  CONSTRAINT table_chat_room_fk FOREIGN KEY (table_id) REFERENCES game_rooms (code) ON DELETE CASCADE,
  CONSTRAINT table_chat_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_history (
  id CHAR(36) NOT NULL PRIMARY KEY,
  game_type VARCHAR(20) NOT NULL,
  table_name VARCHAR(80) NOT NULL,
  target_score INT NULL,
  status ENUM('finished', 'abandoned') NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NOT NULL,
  search_names TEXT NOT NULL,
  players_json MEDIUMTEXT NOT NULL,
  rounds_json MEDIUMTEXT NOT NULL,
  INDEX match_history_ended_idx (ended_at, id),
  INDEX match_history_game_ended_idx (game_type, ended_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

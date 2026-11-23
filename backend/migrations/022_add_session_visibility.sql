-- Add visibility column to game_sessions (public/private)
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'private' NOT NULL;

-- Add role and color columns to user_game_session for spectator support
ALTER TABLE user_game_session ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'viewer' NOT NULL;
ALTER TABLE user_game_session ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3c8dbc' NOT NULL;

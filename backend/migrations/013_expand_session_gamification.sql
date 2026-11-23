ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS active_player_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS score_history JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE game_sessions
SET round_number = 1
WHERE round_number IS NULL OR round_number < 1;

UPDATE game_sessions
SET elapsed_seconds = 0
WHERE elapsed_seconds IS NULL OR elapsed_seconds < 0;

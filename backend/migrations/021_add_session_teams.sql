ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS scoring_mode VARCHAR(20) NOT NULL DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS teams JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE game_sessions SET scoring_mode = 'individual' WHERE scoring_mode IS NULL;
UPDATE game_sessions SET teams = '[]'::jsonb WHERE teams IS NULL;

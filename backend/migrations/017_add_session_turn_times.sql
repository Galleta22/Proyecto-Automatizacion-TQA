ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS turn_times JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE game_sessions
SET turn_times = '{}'::jsonb
WHERE turn_times IS NULL;

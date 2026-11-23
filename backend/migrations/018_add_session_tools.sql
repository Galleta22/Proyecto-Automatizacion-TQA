ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS custom_counters JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dice_history JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE game_sessions SET custom_counters = '[]'::jsonb WHERE custom_counters IS NULL;
UPDATE game_sessions SET dice_history = '[]'::jsonb WHERE dice_history IS NULL;

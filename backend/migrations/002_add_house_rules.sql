-- Migration 002: Add house rules support to game_rules table
-- Adds is_official, source, and added_by_id columns

ALTER TABLE game_rules
ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT TRUE;

ALTER TABLE game_rules
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'bgg';

ALTER TABLE game_rules
ADD COLUMN IF NOT EXISTS added_by_id UUID REFERENCES users(id) ON DELETE SET NULL DEFAULT NULL;

-- Update existing rules to be official
UPDATE game_rules SET is_official = TRUE WHERE is_official IS NULL;
UPDATE game_rules SET source = 'bgg' WHERE source IS NULL;

-- Add index for added_by_id
CREATE INDEX IF NOT EXISTS idx_game_rules_added_by ON game_rules(added_by_id);

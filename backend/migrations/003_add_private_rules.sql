-- Migration 003: Add per-user private rules.

ALTER TABLE game_rules
ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'global';

UPDATE game_rules
SET visibility = 'global'
WHERE visibility IS NULL OR visibility NOT IN ('global', 'private');

CREATE INDEX IF NOT EXISTS idx_game_rules_visibility
ON game_rules(visibility);

CREATE INDEX IF NOT EXISTS idx_game_rules_owner_visibility
ON game_rules(added_by_id, visibility);

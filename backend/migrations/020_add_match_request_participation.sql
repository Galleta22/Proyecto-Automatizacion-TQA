ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS participation_type VARCHAR(20) NOT NULL DEFAULT 'player';

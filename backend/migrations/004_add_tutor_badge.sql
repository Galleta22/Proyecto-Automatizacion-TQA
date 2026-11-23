-- Migration 004: Add the tutor badge to user accounts.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_tutor BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET is_tutor = FALSE
WHERE is_tutor IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_is_tutor
ON users(is_tutor);

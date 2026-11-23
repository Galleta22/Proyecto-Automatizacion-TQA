-- Publication is independent of the tournament lifecycle. Existing tournaments stay private.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS location VARCHAR(180) NOT NULL DEFAULT '';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

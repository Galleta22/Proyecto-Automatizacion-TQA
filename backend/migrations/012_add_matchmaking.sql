CREATE TABLE IF NOT EXISTS match_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,
    location VARCHAR(180) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 4 CHECK (capacity BETWEEN 2 AND 20),
    notes TEXT NOT NULL DEFAULT '',
    tutor_mode VARCHAR(20) NOT NULL DEFAULT 'none'
        CHECK (tutor_mode IN ('none', 'explain', 'play')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'full', 'cancelled', 'completed')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES match_tables(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message VARCHAR(300) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    CONSTRAINT uq_match_requests_table_user UNIQUE (table_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_tables_game ON match_tables(game_id);
CREATE INDEX IF NOT EXISTS idx_match_tables_schedule ON match_tables(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_match_tables_status ON match_tables(status);
CREATE INDEX IF NOT EXISTS idx_match_requests_table ON match_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_user ON match_requests(user_id);

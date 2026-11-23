CREATE TABLE IF NOT EXISTS game_tips (
    id UUID PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_game_tips_game_id ON game_tips(game_id);
CREATE INDEX IF NOT EXISTS ix_game_tips_user_id ON game_tips(user_id);

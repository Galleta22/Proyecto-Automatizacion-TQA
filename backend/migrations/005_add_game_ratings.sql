-- Migration 005: Add one 1-5 rating per user and game.

CREATE TABLE IF NOT EXISTS game_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    CONSTRAINT uq_game_ratings_user_game UNIQUE (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_game_ratings_user
ON game_ratings(user_id);

CREATE INDEX IF NOT EXISTS idx_game_ratings_game
ON game_ratings(game_id);

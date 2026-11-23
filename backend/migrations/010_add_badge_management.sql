CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badge_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'eligible',
    requested_at TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT uq_user_badge_states_user_badge UNIQUE (user_id, badge_id),
    CONSTRAINT ck_user_badge_states_status CHECK (status IN ('eligible', 'pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_badges_slug ON badges(slug);
CREATE INDEX IF NOT EXISTS idx_user_badge_states_user ON user_badge_states(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badge_states_badge ON user_badge_states(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badge_states_status ON user_badge_states(status);

INSERT INTO badges (name, slug, description, is_active)
VALUES ('Tutor', 'tutor', 'Usuario validado para enseñar juegos a otros jugadores.', TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO user_badge_states (user_id, badge_id, status, requested_at, reviewed_at)
SELECT users.id, badges.id, 'approved', NOW(), NOW()
FROM users
JOIN badges ON badges.slug = 'tutor'
WHERE users.is_tutor = TRUE
ON CONFLICT (user_id, badge_id) DO UPDATE SET status = 'approved', reviewed_at = NOW();

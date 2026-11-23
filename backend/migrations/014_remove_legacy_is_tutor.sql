-- Use the approved Tutor badge as the only source of tutor status.

INSERT INTO badges (name, slug, description, is_active)
VALUES ('Tutor', 'tutor', 'Usuario validado para enseñar juegos a otros jugadores.', TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO user_badge_states (user_id, badge_id, status, requested_at, reviewed_at)
SELECT users.id, badges.id, 'approved', NOW(), NOW()
FROM users
JOIN badges ON badges.slug = 'tutor'
WHERE users.is_tutor = TRUE
ON CONFLICT (user_id, badge_id)
DO UPDATE SET status = 'approved', reviewed_at = NOW();

DROP INDEX IF EXISTS idx_users_is_tutor;
ALTER TABLE users DROP COLUMN IF EXISTS is_tutor;

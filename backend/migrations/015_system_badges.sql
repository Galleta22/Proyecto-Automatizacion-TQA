ALTER TABLE badges
ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE badges
SET is_system = TRUE,
    is_active = TRUE,
    name = 'Tutor'
WHERE slug = 'tutor';

UPDATE user_badge_states
SET is_favorite = FALSE
WHERE badge_id IN (SELECT id FROM badges WHERE slug = 'tutor');

INSERT INTO badges (id, name, slug, description, is_active, is_system)
VALUES (
    gen_random_uuid(),
    'Beta Tester',
    'beta-tester',
    'Reconocimiento para quienes prueban nuevas funciones de Ludisist.',
    TRUE,
    FALSE
)
ON CONFLICT (slug) DO NOTHING;

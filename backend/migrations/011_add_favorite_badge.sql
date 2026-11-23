ALTER TABLE user_badge_states
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

WITH first_approved AS (
    SELECT DISTINCT ON (user_id) id
    FROM user_badge_states
    WHERE status = 'approved'
    ORDER BY user_id, reviewed_at NULLS LAST, created_at
)
UPDATE user_badge_states
SET is_favorite = TRUE
WHERE id IN (SELECT id FROM first_approved)
  AND NOT EXISTS (
      SELECT 1
      FROM user_badge_states current_favorite
      WHERE current_favorite.user_id = user_badge_states.user_id
        AND current_favorite.is_favorite = TRUE
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_badge_states_one_favorite
ON user_badge_states(user_id)
WHERE is_favorite = TRUE;

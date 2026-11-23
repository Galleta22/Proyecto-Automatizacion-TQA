ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS account_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_tokens_user_id ON account_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_account_tokens_token_hash ON account_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_account_tokens_purpose ON account_tokens(purpose);

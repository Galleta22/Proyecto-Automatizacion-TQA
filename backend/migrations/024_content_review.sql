CREATE TABLE IF NOT EXISTS content_reports (
 id UUID PRIMARY KEY, manual_id UUID REFERENCES game_manuals(id) ON DELETE SET NULL,
 user_id UUID REFERENCES users(id) ON DELETE SET NULL, title VARCHAR(255) NOT NULL,
 message TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', resolution TEXT DEFAULT '',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS content_revisions (
 id UUID PRIMARY KEY, entity_type VARCHAR(20) NOT NULL, entity_id UUID NOT NULL,
 entity_name VARCHAR(255) NOT NULL, user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 before JSON NOT NULL, after JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_content_revisions_entity_id ON content_revisions(entity_id);

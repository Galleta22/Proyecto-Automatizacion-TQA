-- Añadir columnas a users
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20) DEFAULT 'beginner';
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW();

-- Crear game_categories
CREATE TABLE IF NOT EXISTS game_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Expandir games
ALTER TABLE games ADD COLUMN IF NOT EXISTS bgg_id INTEGER UNIQUE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS min_players INTEGER DEFAULT 1;
ALTER TABLE games ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 10;
ALTER TABLE games ADD COLUMN IF NOT EXISTS min_age INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS playing_time INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS complexity_rating FLOAT DEFAULT 1.0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS image_url VARCHAR(255);
ALTER TABLE games ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Crear game_category_mapping
CREATE TABLE IF NOT EXISTS game_category_mapping (
    game_id UUID REFERENCES games(id),
    category_id INTEGER REFERENCES game_categories(id),
    PRIMARY KEY (game_id, category_id)
);

-- Expandir o crear game_rules
ALTER TABLE game_rules ADD COLUMN IF NOT EXISTS ai_processed_content TEXT;
ALTER TABLE game_rules ADD COLUMN IF NOT EXISTS keywords JSONB DEFAULT '[]';
ALTER TABLE game_rules ADD COLUMN IF NOT EXISTS difficulty_level INTEGER DEFAULT 1;
ALTER TABLE game_rules ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;

-- Crear cafe_inventory
CREATE TABLE IF NOT EXISTS cafe_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id),
    copies_available INTEGER DEFAULT 1,
    copies_total INTEGER DEFAULT 1,
    condition VARCHAR(20) DEFAULT 'excellent',
    location VARCHAR(100),
    last_played TIMESTAMP,
    total_plays INTEGER DEFAULT 0,
    maintenance_notes TEXT,
    purchase_date DATE,
    purchase_price NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear tables
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    table_number INTEGER UNIQUE NOT NULL,
    capacity INTEGER NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    current_session_id UUID REFERENCES game_sessions(id),
    reserved_until TIMESTAMP,
    location VARCHAR(100),
    amenities JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Crear user_game_session (Many-to-Many)
CREATE TABLE IF NOT EXISTS user_game_session (
    user_id UUID REFERENCES users(id),
    session_id UUID REFERENCES game_sessions(id),
    PRIMARY KEY (user_id, session_id)
);

-- Expandir game_sessions
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES tables(id);
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS facilitator_id UUID REFERENCES users(id);
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS rating INTEGER;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS facilitator_notes TEXT;

-- Crear ai_interactions
CREATE TABLE IF NOT EXISTS ai_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES game_sessions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    game_id UUID REFERENCES games(id),
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    response_time_ms INTEGER,
    was_helpful BOOLEAN,
    feedback TEXT,
    model_used VARCHAR(50) DEFAULT 'deepseek-r1',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Crear user_recommendations
CREATE TABLE IF NOT EXISTS user_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    game_id UUID NOT NULL REFERENCES games(id),
    recommendation_type VARCHAR(50) NOT NULL,
    score FLOAT NOT NULL,
    reason TEXT,
    generated_at TIMESTAMP DEFAULT NOW(),
    was_accepted BOOLEAN
);

-- Crear índices para performance
CREATE INDEX IF NOT EXISTS idx_game_rules_game_id ON game_rules(game_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_user_recommendations_user_id ON user_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_id ON ai_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cafe_inventory_game_id ON cafe_inventory(game_id);

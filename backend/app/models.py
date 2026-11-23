from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, ForeignKey, JSON, Text, Numeric, Date, UniqueConstraint, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.database.base import Base

user_follows = Table(
    "user_follows",
    Base.metadata,
    Column("follower_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("following_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, server_default=func.now()),
)

# ==================== USERS ====================
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), default="player", nullable=False)  # admin, facilitador, player
    experience_level = Column(String(20), default="beginner")  # beginner, intermediate, expert
    preferences = Column(JSON, default={})  # favoritas, tiempo max, etc
    stats = Column(JSON, default={})  # juegos jugados, categorías favoritas
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    last_active = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relaciones
    following = relationship(
        "User",
        secondary="user_follows",
        primaryjoin="User.id == user_follows.c.follower_id",
        secondaryjoin="User.id == user_follows.c.following_id",
        back_populates="followers",
    )
    followers = relationship(
        "User",
        secondary="user_follows",
        primaryjoin="User.id == user_follows.c.following_id",
        secondaryjoin="User.id == user_follows.c.follower_id",
        back_populates="following",
    )
    game_session_associations = relationship(
        "UserGameSession", back_populates="user"
    )
    recommendations = relationship("UserRecommendation", back_populates="user")
    ai_interactions = relationship("AIInteraction", back_populates="user")
    game_ratings = relationship("GameRating", back_populates="user", cascade="all, delete-orphan")
    game_tips = relationship("GameTip", back_populates="user", cascade="all, delete-orphan")
    game_manuals = relationship("GameManual", back_populates="uploaded_by", cascade="all, delete-orphan")
    owned_sessions = relationship("GameSession", back_populates="owner", foreign_keys="GameSession.owner_id")
    badge_states = relationship(
        "UserBadgeState",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserBadgeState.user_id",
    )
    hosted_match_tables = relationship("MatchTable", back_populates="host", cascade="all, delete-orphan")
    match_requests = relationship("MatchRequest", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    account_tokens = relationship("AccountToken", back_populates="user", cascade="all, delete-orphan")
    email_verified = Column(Boolean, default=True, nullable=False)


class AccountToken(Base):
    __tablename__ = "account_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    purpose = Column(String(30), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    used_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="account_tokens")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notification_type = Column(String(40), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    message = Column(String(500), nullable=False)
    link = Column(String(255))
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    user = relationship("User", back_populates="notifications")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False, index=True)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])


class Badge(Base):
    __tablename__ = "badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    image_url = Column(String(255))
    is_active = Column(Boolean, default=True, nullable=False)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user_states = relationship("UserBadgeState", back_populates="badge", cascade="all, delete-orphan")


class UserBadgeState(Base):
    __tablename__ = "user_badge_states"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_id", name="uq_user_badge_states_user_badge"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    badge_id = Column(UUID(as_uuid=True), ForeignKey("badges.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="eligible", nullable=False, index=True)
    requested_at = Column(DateTime)
    reviewed_at = Column(DateTime)
    reviewed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    is_favorite = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="badge_states", foreign_keys=[user_id])
    badge = relationship("Badge", back_populates="user_states")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


# ==================== GAME CATEGORIES ====================
class GameCategory(Base):
    __tablename__ = "game_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    icon_url = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())

    # Relaciones
    games = relationship("Game", secondary="game_category_mapping", back_populates="categories")


# ==================== GAMES ====================
class Game(Base):
    __tablename__ = "games"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text)
    bgg_id = Column(Integer, unique=True, nullable=True)  # BoardGameGeek ID
    min_players = Column(Integer, default=1)
    max_players = Column(Integer, default=10)
    min_age = Column(Integer)
    playing_time = Column(Integer)  # minutos
    complexity_rating = Column(Float, default=1.0)  # 1.0-5.0
    image_url = Column(String(255))
    game_metadata = Column(JSON, default={})  # datos BGG, mecánicas, etc
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relaciones
    rules = relationship("GameRule", back_populates="game", cascade="all, delete-orphan")
    categories = relationship("GameCategory", secondary="game_category_mapping", back_populates="games")
    inventory = relationship("CafeInventory", back_populates="game", cascade="all, delete-orphan")
    sessions = relationship("GameSession", back_populates="game", cascade="all, delete-orphan")
    recommendations = relationship("UserRecommendation", back_populates="game", cascade="all, delete-orphan")
    ratings = relationship("GameRating", back_populates="game", cascade="all, delete-orphan")
    tips = relationship("GameTip", back_populates="game", cascade="all, delete-orphan")
    manuals = relationship("GameManual", back_populates="game", cascade="all, delete-orphan")
    match_tables = relationship("MatchTable", back_populates="game", cascade="all, delete-orphan")


class MatchTable(Base):
    __tablename__ = "match_tables"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    location = Column(String(180), nullable=False)
    capacity = Column(Integer, nullable=False, default=4)
    notes = Column(Text, default="")
    tutor_mode = Column(String(20), default="none", nullable=False)
    status = Column(String(20), default="open", nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    host = relationship("User", back_populates="hosted_match_tables")
    game = relationship("Game", back_populates="match_tables")
    requests = relationship("MatchRequest", back_populates="table", cascade="all, delete-orphan")


class MatchRequest(Base):
    __tablename__ = "match_requests"
    __table_args__ = (
        UniqueConstraint("table_id", "user_id", name="uq_match_requests_table_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_id = Column(UUID(as_uuid=True), ForeignKey("match_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(String(300), default="")
    participation_type = Column(String(20), default="player", nullable=False)
    status = Column(String(20), default="pending", nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    reviewed_at = Column(DateTime)

    table = relationship("MatchTable", back_populates="requests")
    user = relationship("User", back_populates="match_requests")


class GameRating(Base):
    __tablename__ = "game_ratings"
    __table_args__ = (
        UniqueConstraint("user_id", "game_id", name="uq_game_ratings_user_game"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="game_ratings")
    game = relationship("Game", back_populates="ratings")


class GameTip(Base):
    __tablename__ = "game_tips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(30), nullable=False, default="general")
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    game = relationship("Game", back_populates="tips")
    user = relationship("User", back_populates="game_tips")


class GameManual(Base):
    __tablename__ = "game_manuals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), unique=True, nullable=False)
    content_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    version = Column(String(50))
    language = Column(String(50))
    source = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())

    game = relationship("Game", back_populates="manuals")
    uploaded_by = relationship("User", back_populates="game_manuals")


# ==================== GAME CATEGORY MAPPING (Many-to-Many) ====================
class GameCategoryMapping(Base):
    __tablename__ = "game_category_mapping"

    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"), primary_key=True)
    category_id = Column(Integer, ForeignKey("game_categories.id"), primary_key=True)


# ==================== GAME RULES ====================
class GameRule(Base):
    __tablename__ = "game_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"), nullable=False, index=True)
    rule_type = Column(String(50), nullable=False)  # setup, gameplay, scoring, faq, quick_start
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    ai_processed_content = Column(Text)  # DeepSeek procesado para búsqueda
    keywords = Column(JSON, default=[])  # búsqueda semántica
    difficulty_level = Column(Integer, default=1)  # 1-5 complejidad
    order = Column(Integer, default=0)  # para ordenar reglas
    is_official = Column(Boolean, default=True)  # True = regla oficial del juego, False = regla casera
    source = Column(String(50), default="bgg")  # bgg, admin, house, community
    visibility = Column(String(20), default="global", nullable=False, index=True)
    added_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # quien agregó/modificó
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relaciones
    game = relationship("Game", back_populates="rules")
    added_by = relationship("User", foreign_keys=[added_by_id])


# ==================== CAFE INVENTORY ====================
class CafeInventory(Base):
    __tablename__ = "cafe_inventory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"), nullable=False, index=True)
    copies_available = Column(Integer, default=1)
    copies_total = Column(Integer, default=1)
    condition = Column(String(20), default="excellent")  # excellent, good, fair, poor
    location = Column(String(100))  # Estante A-3, Bodega, etc
    last_played = Column(DateTime)
    total_plays = Column(Integer, default=0)
    maintenance_notes = Column(Text)
    purchase_date = Column(Date)
    purchase_price = Column(Numeric(10, 2))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relaciones
    game = relationship("Game", back_populates="inventory")


# ==================== TABLES (Mesas del Café) ====================
class Table(Base):
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True)
    table_number = Column(Integer, unique=True, nullable=False)
    capacity = Column(Integer, nullable=False)
    is_available = Column(Boolean, default=True)
    current_session_id = Column(UUID(as_uuid=True), ForeignKey("game_sessions.id"), nullable=True)
    reserved_until = Column(DateTime)
    location = Column(String(100))  # Zona A, Zona B, etc
    amenities = Column(JSON, default=[])  # Toma de corriente, Sillas premium, etc
    created_at = Column(DateTime, server_default=func.now())


# ==================== USER_GAME_SESSION (Many-to-Many) ====================
class UserGameSession(Base):
    __tablename__ = "user_game_session"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("game_sessions.id"), primary_key=True)
    role = Column(String(20), default="viewer")  # "viewer" | "participant"
    color = Column(String(20), default="#3c8dbc")

    user = relationship("User", back_populates="game_session_associations")
    game_session = relationship("GameSession", back_populates="user_associations")


# ==================== GAME SESSIONS ====================
class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    table_id = Column(Integer, ForeignKey("tables.id"), nullable=True)
    cafe_location = Column(String(100), default="Monster Dojo")
    players = Column(JSON)  # [{user_id, username, score}]
    facilitator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    start_time = Column(DateTime, nullable=False, server_default=func.now())
    end_time = Column(DateTime)
    rating = Column(Integer)  # 1-5 valoración partida
    feedback = Column(Text)
    table_number = Column(Integer)
    facilitator_notes = Column(Text)
    notes = Column(Text)
    snapshots = Column(JSON, default=[])
    turn_order = Column(JSON, default=[])
    turn_order_enabled = Column(Boolean, default=False, nullable=False)
    round_number = Column(Integer, default=1, nullable=False)
    active_player_id = Column(String(100))
    elapsed_seconds = Column(Integer, default=0, nullable=False)
    turn_times = Column(JSON, default={})
    score_history = Column(JSON, default=[])
    custom_counters = Column(JSON, default=[])
    dice_history = Column(JSON, default=[])
    scoring_mode = Column(String(20), default="individual", nullable=False)
    teams = Column(JSON, default=[])
    visibility = Column(String(20), default="private")  # "public" | "private"
    status = Column(String(20), default="active", nullable=False)
    expires_at = Column(DateTime)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relaciones
    game = relationship("Game", back_populates="sessions")
    owner = relationship("User", back_populates="owned_sessions", foreign_keys=[owner_id])
    table = relationship("Table", foreign_keys=[table_id])
    facilitator = relationship("User", foreign_keys=[facilitator_id])
    user_associations = relationship(
        "UserGameSession", back_populates="game_session", cascade="all, delete-orphan"
    )
    ai_interactions = relationship("AIInteraction", back_populates="session", cascade="all, delete-orphan")


# ==================== AI INTERACTIONS ====================
class AIInteraction(Base):
    __tablename__ = "ai_interactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("game_sessions.id"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"), nullable=True, index=True)
    query = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    context = Column(JSON, default={})  # regla_id, session_id, etc
    response_time_ms = Column(Integer)
    was_helpful = Column(Boolean, nullable=True)
    feedback = Column(Text)
    model_used = Column(String(50), default="gemma4")
    created_at = Column(DateTime, server_default=func.now(), index=True)

    # Relaciones
    user = relationship("User", back_populates="ai_interactions")
    session = relationship("GameSession", back_populates="ai_interactions")


# ==================== USER RECOMMENDATIONS ====================
class UserRecommendation(Base):
    __tablename__ = "user_recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"), nullable=False, index=True)
    recommendation_type = Column(String(50), nullable=False)  # collaborative, content-based, hybrid
    score = Column(Float, nullable=False)  # 0.0-1.0
    reason = Column(Text)
    generated_at = Column(DateTime, server_default=func.now())
    was_accepted = Column(Boolean, nullable=True)

    # Relaciones
    user = relationship("User", back_populates="recommendations")
    game = relationship("Game", back_populates="recommendations")


# ==================== AUDIT LOG ====================
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, server_default=func.now(), index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    username = Column(String(100))
    action = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(100))
    entity_name = Column(String(200))
    details = Column(JSON, default={})
    ip_address = Column(String(50))

    user = relationship("User", backref="audit_logs")




# ==================== TOURNAMENTS ====================
class Tournament(Base):
    __tablename__ = "tournaments"

    is_public = Column(Boolean, default=False, server_default="false", nullable=False)
    location = Column(String(180), default="", server_default="", nullable=False)
    scheduled_at = Column(DateTime, nullable=True)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(150), nullable=False)
    description = Column(Text, default="")
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(20), default="draft", nullable=False, index=True)  # draft, active, completed, cancelled
    max_participants = Column(Integer, default=16, nullable=False)
    elimination = Column(Boolean, default=False, server_default="false", nullable=False)
    advance_per_table = Column(Integer, default=2, server_default="2", nullable=False)
    competition_format = Column(String(20), default="individual", server_default="individual", nullable=False)
    table_size = Column(Integer, default=4, server_default="4", nullable=False)
    team_size = Column(Integer, default=2, server_default="2", nullable=False)
    current_round = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relaciones
    game = relationship("Game", backref="tournaments")
    created_by = relationship("User", foreign_keys=[created_by_id])
    participants = relationship("TournamentParticipant", back_populates="tournament", cascade="all, delete-orphan")
    judges = relationship("TournamentJudge", back_populates="tournament", cascade="all, delete-orphan")
    rounds = relationship("TournamentRound", back_populates="tournament", cascade="all, delete-orphan", order_by="TournamentRound.round_number")


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tournament_id = Column(UUID(as_uuid=True), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    external_name = Column(String(100), nullable=True)
    team_members = Column(JSON)
    skill_level = Column(String(20), default="intermedio", nullable=False)  # principiante, intermedio, avanzado, experto
    wins = Column(Integer, default=0, nullable=False)
    losses = Column(Integer, default=0, nullable=False)
    draws = Column(Integer, default=0, nullable=False)
    points = Column(Float, default=0.0, nullable=False)
    has_bye = Column(Boolean, default=False, nullable=False)
    seed = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    tournament = relationship("Tournament", back_populates="participants")
    user = relationship("User", foreign_keys=[user_id])

    @property
    def display_name(self):
        if self.user:
            prefs = self.user.preferences or {}
            return prefs.get("nickname") or self.user.username
        return self.external_name or "Participante"


class TournamentJudge(Base):
    __tablename__ = "tournament_judges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tournament_id = Column(UUID(as_uuid=True), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_head_judge = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    tournament = relationship("Tournament", back_populates="judges")
    user = relationship("User", foreign_keys=[user_id])


class TournamentRound(Base):
    decision = Column(JSON)
    __tablename__ = "tournament_rounds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tournament_id = Column(UUID(as_uuid=True), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # pending, active, completed
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    tournament = relationship("Tournament", back_populates="rounds")
    matches = relationship("TournamentMatch", back_populates="round", cascade="all, delete-orphan", order_by="TournamentMatch.table_number")


class TournamentMatch(Base):
    __tablename__ = "tournament_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id = Column(UUID(as_uuid=True), ForeignKey("tournament_rounds.id", ondelete="CASCADE"), nullable=False, index=True)
    tournament_id = Column(UUID(as_uuid=True), ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    table_number = Column(Integer, default=1, nullable=False)
    participant1_id = Column(UUID(as_uuid=True), ForeignKey("tournament_participants.id", ondelete="SET NULL"), nullable=True)
    participant2_id = Column(UUID(as_uuid=True), ForeignKey("tournament_participants.id", ondelete="SET NULL"), nullable=True)
    winner_id = Column(UUID(as_uuid=True), ForeignKey("tournament_participants.id", ondelete="SET NULL"), nullable=True)
    table_entries = Column(JSON)
    placements = Column(JSON)
    score_p1 = Column(Float, default=0, nullable=False)
    score_p2 = Column(Float, default=0, nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # pending, in_progress, completed
    judge_id = Column(UUID(as_uuid=True), ForeignKey("tournament_judges.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    round = relationship("TournamentRound", back_populates="matches")
    participant1 = relationship("TournamentParticipant", foreign_keys=[participant1_id])
    participant2 = relationship("TournamentParticipant", foreign_keys=[participant2_id])
    winner = relationship("TournamentParticipant", foreign_keys=[winner_id])
    judge = relationship("TournamentJudge", foreign_keys=[judge_id])

# Alias for backward compatibility
Rule = GameRule


class ContentReport(Base):
    __tablename__ = "content_reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manual_id = Column(UUID(as_uuid=True), ForeignKey("game_manuals.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), default="pending", nullable=False)
    resolution = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())


class ContentRevision(Base):
    __tablename__ = "content_revisions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(20), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    entity_name = Column(String(255), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    before = Column(JSON, nullable=False)
    after = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

from pathlib import Path

from sqlalchemy import inspect, text

from app.database.base import Base, SessionLocal, engine
from app.models import Badge


MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def run_migrations() -> None:
    """Apply pending SQL migrations and record each successful file."""
    migration_files = sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql"))

    # A new installation already receives the current schema from the models.
    # Record the historical migrations so they are not replayed over it.
    is_fresh_database = "users" not in inspect(engine).get_table_names()
    if is_fresh_database:
        Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        ))
        applied = {
            row[0]
            for row in connection.execute(text("SELECT filename FROM schema_migrations"))
        }

        for migration_file in migration_files:
            if migration_file.name in applied:
                continue
            if not is_fresh_database:
                connection.exec_driver_sql(migration_file.read_text(encoding="utf-8-sig"))
            connection.execute(
                text("INSERT INTO schema_migrations (filename) VALUES (:filename)"),
                {"filename": migration_file.name},
            )

    # Keep create_all for tables introduced before a corresponding migration exists.
    Base.metadata.create_all(bind=engine)
    _ensure_default_badges(include_examples=is_fresh_database)


def _ensure_default_badges(include_examples: bool = False) -> None:
    defaults = [{
        "name": "Tutor",
        "slug": "tutor",
        "description": "Usuario validado para enseñar juegos a otros jugadores.",
        "is_system": True,
    }]
    if include_examples:
        defaults.append({
            "name": "Beta Tester",
            "slug": "beta-tester",
            "description": "Reconocimiento para quienes prueban nuevas funciones de Ludisist.",
            "is_system": False,
        })
    db = SessionLocal()
    try:
        for item in defaults:
            badge = db.query(Badge).filter(Badge.slug == item["slug"]).first()
            if badge:
                if item["is_system"]:
                    badge.name = item["name"]
                    badge.is_active = True
                    badge.is_system = True
                continue
            db.add(Badge(is_active=True, **item))
        db.commit()
    finally:
        db.close()

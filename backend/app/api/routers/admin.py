import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.core.config import settings
from app.models import AIInteraction, AuditLog, Game, GameCategory, GameRule, GameSession, MatchRequest, MatchTable, User, UserGameSession
from app.core.time import utc_now
from app.services.game_coverage import MISSING_GAME_IMAGE, MISSING_QUICK_RULES
from app.services.storage_cleanup import (
    BUILD_UPLOAD_DIR,
    MANUALS_DIR,
    PUBLIC_UPLOAD_DIR,
    UPLOAD_GLOB,
)


router = APIRouter()

BACKEND_DIR = Path(__file__).resolve().parents[3]
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
SIZE_EXCLUDED_DIRS = {
    ".git",
    ".npm-cache",
    "__pycache__",
    "node_modules",
    "uploads",
    "venv",
}
SIZE_EXCLUDED_SUFFIXES = {".pyc", ".log"}


def _directory_size(path: Path) -> int:
    if not path.is_dir():
        return 0

    total = 0
    for root, directories, files in os.walk(path):
        directories[:] = [
            directory
            for directory in directories
            if directory not in SIZE_EXCLUDED_DIRS
            and not (Path(root) / directory).is_symlink()
        ]
        for filename in files:
            file_path = Path(root) / filename
            if (
                (file_path.parent in {PUBLIC_UPLOAD_DIR, BUILD_UPLOAD_DIR} and file_path.match(UPLOAD_GLOB))
                or file_path.suffix.lower() in SIZE_EXCLUDED_SUFFIXES
                or file_path.is_symlink()
            ):
                continue
            try:
                total += file_path.stat().st_size
            except OSError:
                continue
    return total


def _files_size(paths: list[Path], pattern: str = "*") -> int:
    total = 0
    for directory in paths:
        if not directory.is_dir():
            continue
        for file_path in directory.glob(pattern):
            if not file_path.is_file() or file_path.is_symlink():
                continue
            try:
                total += file_path.stat().st_size
            except OSError:
                continue
    return total


@router.get("/overview")
def admin_overview(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    users_total = db.query(func.count(User.id)).scalar() or 0
    users_active = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0
    games_total = db.query(func.count(Game.id)).scalar() or 0
    rules_total = db.query(func.count(GameRule.id)).filter(GameRule.visibility == "global").scalar() or 0
    ai_total = db.query(func.count(AIInteraction.id)).scalar() or 0

    games_without_rules = (
        db.query(func.count(Game.id))
        .filter(MISSING_QUICK_RULES)
        .scalar()
        or 0
    )
    games_without_images = (
        db.query(func.count(Game.id))
        .filter(MISSING_GAME_IMAGE)
        .scalar()
        or 0
    )
    recent_logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(8).all()
    active_tables = db.query(MatchTable).options(
        joinedload(MatchTable.requests)
    ).filter(
        MatchTable.status.in_(["open", "full"]),
        MatchTable.scheduled_at >= utc_now(),
    ).all()
    table_participant_ids = {table.host_id for table in active_tables}
    table_participant_ids.update(
        request.user_id
        for table in active_tables
        for request in table.requests
        if request.status == "approved" and request.participation_type != "tutor_explain"
    )

    # Fechas agrupadas por dialecto; permite validar los flujos en SQLite aislado.
    sqlite = db.bind.dialect.name == "sqlite"
    month_expr = func.strftime("%Y-%m", User.created_at) if sqlite else func.date_trunc("month", User.created_at)
    day_expr = func.strftime("%Y-%m-%d", GameSession.end_time) if sqlite else func.date_trunc("day", GameSession.end_time)
    months = db.query(month_expr, func.count(User.id)).filter(User.created_at >= utc_now() - timedelta(days=366)).group_by(month_expr).order_by(month_expr).all()
    days = db.query(day_expr, func.count(GameSession.id)).filter(GameSession.is_completed.is_(True), GameSession.end_time >= utc_now() - timedelta(days=30)).group_by(day_expr).order_by(day_expr).all()
    return {
        "users": {
            "total": users_total,
            "active": users_active,
            "inactive": users_total - users_active,
        },
        "games": {
            "total": games_total,
            "without_rules": games_without_rules,
            "without_images": games_without_images,
        },
        "rules": {"total": rules_total},
        "ai": {"interactions": ai_total, "model": settings.AI_MODEL},
        "tables": {
            "active": len(active_tables),
            "participating_users": len(table_participant_ids),
        },
        "recent_activity": [
            {
                "id": str(log.id),
                "timestamp": log.timestamp.isoformat(),
                "username": log.username,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_name": log.entity_name,
            }
            for log in recent_logs
        ],
        "charts": {
            "users_by_month": [{"month": r[0] if sqlite else r[0].strftime("%Y-%m"), "count": r[1]} for r in months],
            "games_by_genre": [
                {"genre": "Estrategia", "count": db.query(func.count(Game.id)).join(Game.categories).filter(GameCategory.name.ilike("%Estrategia%")).scalar() or 0},
                {"genre": "Familiar", "count": db.query(func.count(Game.id)).join(Game.categories).filter(GameCategory.name.ilike("%Familiar%")).scalar() or 0},
                {"genre": "Cooperativo", "count": db.query(func.count(Game.id)).join(Game.categories).filter(GameCategory.name.ilike("%Cooperativo%")).scalar() or 0},
                {"genre": "Party", "count": db.query(func.count(Game.id)).join(Game.categories).filter(GameCategory.name.ilike("%Party%")).scalar() or 0},
                {"genre": "Cartas", "count": db.query(func.count(Game.id)).join(Game.categories).filter(GameCategory.name.ilike("%Cartas%")).scalar() or 0},
                {"genre": "Otros", "count": max(0, games_total - sum(
                    db.query(func.count(Game.id)).join(Game.categories).filter(GameCategory.name.ilike(g)).scalar() or 0
                    for g in ["%Estrategia%", "%Familiar%", "%Cooperativo%", "%Party%", "%Cartas%"]
                ))},
            ],
            "sessions_by_day": [{"date": r[0] if sqlite else r[0].strftime("%Y-%m-%d"), "count": r[1]} for r in days],
        },
    }


@router.get("/tables")
def admin_list_tables(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    all_items: bool = Query(False),
    status: str = Query("", pattern="^(open|full|cancelled|finished|active|all)?$"),
    host: str = Query("", max_length=100),
    scheduled_from: datetime | None = Query(None),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    now = utc_now()
    if status == "active":
        id_query = db.query(MatchTable.id).filter(
            MatchTable.status.in_(["open", "full"]),
            MatchTable.scheduled_at >= now,
        )
    elif status == "finished":
        id_query = db.query(MatchTable.id).filter(MatchTable.status == "finished")
    elif status == "cancelled":
        id_query = db.query(MatchTable.id).filter(MatchTable.status == "cancelled")
    else:
        id_query = db.query(MatchTable.id).filter(
            MatchTable.status.in_(["open", "full", "finished", "cancelled"])
        )
    active_tables = db.query(func.count(MatchTable.id)).filter(
        MatchTable.status.in_(["open", "full"]),
        MatchTable.scheduled_at >= now,
    ).scalar() or 0
    finished_count = db.query(func.count(MatchTable.id)).filter(MatchTable.status == "finished").scalar() or 0
    cancelled_count = db.query(func.count(MatchTable.id)).filter(MatchTable.status == "cancelled").scalar() or 0
    all_count = db.query(MatchTable.id).filter(
        MatchTable.status.in_(["open", "full", "finished", "cancelled"])
    ).count()
    if host.strip():
        pattern = f"%{host.strip()}%"
        id_query = id_query.join(MatchTable.host).filter(
            or_(User.username.ilike(pattern), User.preferences["nickname"].as_string().ilike(pattern))
        )
    if scheduled_from is not None:
        if scheduled_from.tzinfo is not None:
            scheduled_from = scheduled_from.astimezone(timezone.utc).replace(tzinfo=None)
        id_query = id_query.filter(MatchTable.scheduled_at >= scheduled_from)
    id_query = id_query.order_by(MatchTable.scheduled_at.desc().nullslast(), MatchTable.id)
    total = id_query.count()
    if not all_items:
        id_query = id_query.offset((page - 1) * page_size).limit(page_size)
    ids = [row[0] for row in id_query.all()]
    tables = db.query(MatchTable).options(
        joinedload(MatchTable.game).joinedload(Game.categories),
        joinedload(MatchTable.host),
        joinedload(MatchTable.requests).joinedload(MatchRequest.user),
    ).filter(MatchTable.id.in_(ids)).all()
    table_map = {t.id: t for t in tables}
    tables = [table_map[tid] for tid in ids if tid in table_map]
    items = []
    genre_counter: dict[str, int] = {}
    total_duration_minutes = 0
    tables_with_duration = 0
    for table in tables:
        playing = [
            request for request in table.requests
            if request.status == "approved" and request.participation_type != "tutor_explain"
        ]
        explainers = [
            request for request in table.requests
            if request.status == "approved" and request.participation_type == "tutor_explain"
        ]
        participants = [{
            "user_id": str(table.host_id),
            "user_name": (table.host.preferences or {}).get("nickname") or table.host.username,
            "role": "host",
        }, *[{
            "user_id": str(request.user_id),
            "user_name": (request.user.preferences or {}).get("nickname") or request.user.username,
            "role": "tutor_play" if request.participation_type == "tutor_play" else "player",
        } for request in playing]]
        for genre in (table.game.categories or []):
            genre_counter[genre.name] = genre_counter.get(genre.name, 0) + 1
        if table.created_at and (table.updated_at or table.scheduled_at):
            end = table.updated_at or (table.scheduled_at + (now - table.scheduled_at))
            delta = (end - table.created_at).total_seconds() / 60
            if delta > 0 and delta < 525600:
                total_duration_minutes += delta
                tables_with_duration += 1
        items.append({
            "id": str(table.id),
            "title": table.title,
            "game_name": table.game.name,
            "game_image_url": table.game.image_url,
            "host_name": (table.host.preferences or {}).get("nickname") or table.host.username,
            "scheduled_at": table.scheduled_at.replace(tzinfo=timezone.utc).isoformat() if table.scheduled_at else None,
            "location": table.location,
            "capacity": table.capacity,
            "occupied_spots": len(participants),
            "available_spots": max(table.capacity - len(participants), 0),
            "tutor_mode": table.tutor_mode,
            "status": table.status,
            "notes": table.notes or "",
            "pending_requests": len([request for request in table.requests if request.status == "pending"]),
            "participants": participants,
            "tutor_explainers": [{
                "user_id": str(request.user_id),
                "user_name": (request.user.preferences or {}).get("nickname") or request.user.username,
            } for request in explainers],
        })
    pages = 1 if all_items else max((total + page_size - 1) // page_size, 1)
    sorted_genres = sorted(genre_counter.items(), key=lambda x: -x[1])
    return {
        "items": items,
        "page": 1 if all_items else page,
        "page_size": total if all_items else page_size,
        "total": total,
        "pages": pages,
        "all_items": all_items,
        "stats": {"active": active_tables, "finished": finished_count, "cancelled": cancelled_count, "all": all_count},
        "report": {
            "favorite_genres": [{"name": g, "count": c} for g, c in sorted_genres],
            "avg_duration_minutes": round(total_duration_minutes / tables_with_duration) if tables_with_duration else 0,
        },
    }


@router.get("/system")
def admin_system_status(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    checked_at = datetime.now(timezone.utc).isoformat()
    started = time.perf_counter()
    database_error = None
    storage_error = None
    database_bytes = None
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        db.rollback()
        database_error = "Falló la comprobación de PostgreSQL."
    database_ms = round((time.perf_counter() - started) * 1000)
    if not database_error:
        try:
            database_bytes = db.execute(
                text("SELECT pg_database_size(current_database())")
            ).scalar()
        except SQLAlchemyError:
            db.rollback()
            storage_error = "No se pudo consultar el tamaño de la base de datos."

    ollama_started = time.perf_counter()
    ollama_healthy = False
    ollama_models = []
    ollama_error = None
    try:
        response = requests.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=5)
        if response.ok:
            ollama_models = [item["name"] for item in response.json().get("models", []) if item.get("name")]
            ollama_healthy = True
        else:
            ollama_error = f"Ollama respondió con HTTP {response.status_code}."
    except requests.Timeout:
        ollama_error = "Ollama no respondió dentro del tiempo de espera."
    except (AttributeError, TypeError, ValueError):
        ollama_error = "Ollama devolvió una lista de modelos inválida."
    except requests.RequestException:
        ollama_error = "No se pudo conectar con Ollama."

    frontend_bytes = _directory_size(FRONTEND_DIR)
    backend_bytes = _directory_size(BACKEND_DIR)
    uploaded_images_bytes = _files_size(
        [PUBLIC_UPLOAD_DIR, BUILD_UPLOAD_DIR], UPLOAD_GLOB
    )
    manuals_bytes = _files_size([MANUALS_DIR])
    uploads_bytes = uploaded_images_bytes + _directory_size(BACKEND_DIR / "uploads")

    return {
        "checked_at": checked_at,
        "backend": {"healthy": True},
        "database": {
            "healthy": database_error is None,
            "error": database_error,
            "latency_ms": database_ms,
            "size_bytes": database_bytes,
        },
        "ollama": {
            "healthy": ollama_healthy,
            "latency_ms": round((time.perf_counter() - ollama_started) * 1000),
            "url": settings.OLLAMA_BASE_URL,
            "active_model": settings.AI_MODEL,
            "installed_models": ollama_models,
            "error": ollama_error,
        },
        "storage": {
            "frontend_bytes": frontend_bytes,
            "backend_bytes": backend_bytes,
            "database_bytes": database_bytes,
            "uploads_bytes": uploads_bytes,
            "uploaded_images_bytes": uploaded_images_bytes,
            "manuals_bytes": manuals_bytes,
            "total_bytes": frontend_bytes + backend_bytes + database_bytes + uploads_bytes if database_bytes is not None else None,
            "error": storage_error,
            "excluded": ["node_modules", "venv", ".npm-cache", "__pycache__", "*.log"],
        },
        "configuration": {
            "ai_provider": settings.AI_PROVIDER,
            "ai_model": settings.AI_MODEL,
            "token_expiry_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            "bgg_configured": bool(settings.BGG_API_TOKEN),
        },
    }


@router.get("/ai-activity")
def admin_ai_activity(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    rows = db.query(
        AIInteraction.model_used, func.count(AIInteraction.id), func.avg(AIInteraction.response_time_ms),
    ).group_by(AIInteraction.model_used).order_by(func.count(AIInteraction.id).desc()).all()
    return {
        "total": sum(count for _, count, _ in rows),
        "items": [
            {"model": model, "count": count, "average_ms": round(float(average)) if average is not None else None}
            for model, count, average in rows
        ],
    }


@router.get("/rules")
def admin_list_rules(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    search: str = Query(""),
    game_id: str = Query(""),
    visibility: str = Query("all", pattern="^(all|global|private)$"),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    query = db.query(GameRule).options(joinedload(GameRule.added_by)).join(Game).filter(
        or_(GameRule.visibility == "global", GameRule.added_by_id == user.id)
    )
    if visibility != "all":
        query = query.filter(GameRule.visibility == visibility)
    if search:
        query = query.filter((GameRule.title.ilike(f"%{search}%")) | (GameRule.content.ilike(f"%{search}%")))
    if game_id:
        query = query.filter(GameRule.game_id == game_id)
    total = query.count()
    query = query.order_by(GameRule.created_at.desc())
    rules = query.offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for rule in rules:
        items.append({
            "id": str(rule.id),
            "title": rule.title,
            "content": rule.content,
            "rule_type": rule.rule_type,
            "game_id": str(rule.game_id),
            "game_name": rule.game.name,
            "is_official": rule.is_official,
            "source": rule.source,
            "visibility": rule.visibility,
            "added_by_id": str(rule.added_by_id) if rule.added_by_id else None,
            "added_by_name": rule.added_by.username if rule.added_by else None,
            "created_at": rule.created_at.isoformat() if rule.created_at else None,
        })
    pages = max((total + page_size - 1) // page_size, 1)
    return {"items": items, "page": page, "page_size": page_size, "total": total, "pages": pages}


@router.get("/sessions")
def admin_list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    all_items: bool = Query(False),
    status: str = Query("all", pattern="^(all|active|completed|live)$"),
    scope: str = Query("all", pattern="^(all|mine)$"),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    query = db.query(GameSession)
    if scope == "mine":
        query = query.filter(GameSession.owner_id == user.id)
    active_filter = GameSession.is_completed.is_(False) & (GameSession.status == "active")
    completed_filter = GameSession.is_completed.is_(True)
    live_filter = active_filter & (GameSession.visibility == "public")
    active = query.filter(active_filter).count()
    completed = query.filter(completed_filter).count()
    public = query.filter(live_filter).count()
    filters = {"active": active_filter, "completed": completed_filter, "live": live_filter}
    if status in filters:
        query = query.filter(filters[status])
    total = query.count()
    ordered = query.options(
        joinedload(GameSession.game),
        joinedload(GameSession.owner),
    ).order_by(GameSession.updated_at.desc(), GameSession.id)
    sessions = ordered.all() if all_items else ordered.offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for session in sessions:
        items.append({
            "id": str(session.id),
            "game_name": session.game.name,
            "game_id": str(session.game_id),
            "scoring_mode": session.scoring_mode,
            "owner_name": session.owner.username if session.owner else "",
            "visibility": session.visibility,
            "status": session.status,
            "is_completed": session.is_completed,
            "player_count": len(session.players or []),
            "round_number": session.round_number or 1,
            "elapsed_seconds": session.elapsed_seconds or 0,
            "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        })
    pages = 1 if all_items else max((total + page_size - 1) // page_size, 1)
    return {"items": items, "page": page, "page_size": page_size, "total": total, "pages": pages, "active": active, "completed": completed, "public": public}

import math
from datetime import date
from sqlalchemy.orm import Session
from app.models import Badge, User, UserBadgeState
from app.services.notifications import notify


def _xp_for_level(xp: int) -> int:
    return int(math.isqrt(xp // 100)) if xp >= 100 else 0


def _next_level_xp(level: int) -> int:
    return (level + 1) ** 2 * 100


def _level_progress(xp: int) -> dict:
    level = _xp_for_level(xp)
    current = level ** 2 * 100
    next_xp = (level + 1) ** 2 * 100
    progress = ((xp - current) / (next_xp - current)) * 100 if next_xp > current else 0
    return {"level": level, "xp": xp, "xp_for_next": next_xp, "progress": round(progress, 1)}


def _award_xp(user: User, db: Session, amount: int, reason: str = ""):
    stats = dict(user.stats or {})
    stats["xp"] = stats.get("xp", 0) + amount
    user.stats = stats
    return _level_progress(stats["xp"])


def _update_streak(user: User, db: Session):
    stats = dict(user.stats or {})
    today = date.today()
    last_active = stats.get("last_active_date")
    streak = stats.get("daily_streak", 0)
    if last_active != today.isoformat():
        if last_active:
            from datetime import timedelta
            yesterday = (today - timedelta(days=1)).isoformat()
            if last_active == yesterday:
                streak += 1
            else:
                streak = 1
        else:
            streak = 1
        stats["last_active_date"] = today.isoformat()
        stats["daily_streak"] = streak
        if streak > 1:
            bonus = min(streak * 2, 50)
            _award_xp(user, db, bonus, f"Racha de {streak} días")
    user.stats = stats
    return streak


BADGE_MILESTONES = {
    "first_session": {"slug": "first_session", "name": "Primera partida", "description": "Finaliza 1 partida registrada.", "stat": "sessions_played", "threshold": 1},
    "veteran": {"slug": "veteran", "name": "Veterano", "description": "Finaliza 50 partidas registradas.", "stat": "sessions_played", "threshold": 50},
    "explorer": {"slug": "explorer", "name": "Explorador", "description": "Juega 5 juegos distintos.", "stat": "games_played", "threshold": 5},
    "scholar": {"slug": "scholar", "name": "Estudioso", "description": "Acumula 20 consultas de reglas.", "stat": "rules_viewed", "threshold": 20},
    "streak_7": {"slug": "streak_7", "name": "Asiduo", "description": "Registra actividad que otorga XP durante 7 días consecutivos.", "stat": "daily_streak", "threshold": 7},
    "streak_30": {"slug": "streak_30", "name": "Devoto", "description": "Registra actividad que otorga XP durante 30 días consecutivos.", "stat": "daily_streak", "threshold": 30},
    "marathon": {"slug": "marathon", "name": "Maratonista", "description": "Acumula 10 horas de juego registradas.", "stat": "total_time_played", "threshold": 36000},
}


def _ensure_auto_badges(user: User, db: Session):
    stats = user.stats or {}
    for badge_def in BADGE_MILESTONES.values():
        if stats.get(badge_def["stat"], 0) < badge_def["threshold"]:
            continue
        existing = db.query(Badge).filter(Badge.slug == badge_def["slug"]).first()
        if not existing:
            existing = Badge(
                name=badge_def["name"],
                slug=badge_def["slug"],
                description=badge_def["description"],
                is_active=True,
                is_system=True,
            )
            db.add(existing)
            db.flush()
        state = db.query(UserBadgeState).filter(
            UserBadgeState.user_id == user.id,
            UserBadgeState.badge_id == existing.id,
        ).first()
        if not state:
            state = UserBadgeState(
                user_id=user.id,
                badge_id=existing.id,
                status="approved",
                is_favorite=False,
            )
            db.add(state)
            db.flush()
            notify(db, user.id, "badge_assigned", f"¡Logro desbloqueado: {badge_def['name']}!",
                   f"Has conseguido la insignia {badge_def['name']} por tu actividad en Ludisist.", "/perfil")

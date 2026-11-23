import math
from datetime import date
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload
from app.api import deps
from app.core import security
from app.models import GameSession, User, UserBadgeState, UserGameSession, UserRecommendation, user_follows
from app.schemas.user import UserCreate, UserUpdate, UserDeactivateRequest, UserProfileUpdate, NotificationPreferences
from app.api.routers.audit import log_action
from app.services.account_tokens import deliver_account_link, issue_token, token_response

router = APIRouter()


def _is_tutor(user: User) -> bool:
    return any(
        state.status == "approved"
        and state.badge.slug == "tutor"
        and state.badge.is_active
        for state in user.badge_states
    )


def _session_counts(db: Session, user_ids) -> dict:
    ids = list(user_ids)
    counts = {user_id: {"active": set(), "completed": set()} for user_id in ids}
    if not ids:
        return {}

    owner_rows = db.query(
        GameSession.owner_id, GameSession.id, GameSession.is_completed, GameSession.status
    ).filter(GameSession.owner_id.in_(ids)).all()
    linked_rows = db.query(
        UserGameSession.user_id, GameSession.id, GameSession.is_completed, GameSession.status
    ).join(GameSession, GameSession.id == UserGameSession.session_id).filter(
        UserGameSession.user_id.in_(ids)
    ).all()
    for user_id, session_id, is_completed, status in [*owner_rows, *linked_rows]:
        key = "completed" if is_completed or status == "completed" else "active"
        counts[user_id][key].add(session_id)
    return {
        user_id: {
            "active": len(values["active"]),
            "completed": len(values["completed"]),
        }
        for user_id, values in counts.items()
    }

@router.post("/register", response_model=dict)
def register_player(user: UserCreate, db: Session = Depends(deps.get_db)):
    """
    Public endpoint for player registration. Always assigns 'player' role.
    """
    if db.query(User).filter_by(username=user.username).first():
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    if db.query(User).filter_by(email=user.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    # Enforce player role regardless of input
    nuevo = User(
        username=user.username,
        email=user.email,
        password=security.get_password_hash(user.password),
        role="player",
        email_verified=False,
        experience_level=user.experience_level,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    raw_token = issue_token(db, nuevo, "verify_email", 1440)
    delivered = deliver_account_link(nuevo.email, "Verifica tu correo en Ludisist", "/verificar-correo", raw_token)
    return {
        "id": nuevo.id,
        "username": nuevo.username,
        "email": nuevo.email,
        "role": nuevo.role,
        "email_verified": False,
        **token_response("Revisa tu correo para verificar la cuenta" if delivered else "Cuenta creada; completa la verificación local", raw_token),
    }

@router.post("/", response_model=dict)
def create_user(user: UserCreate, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.require_role("admin"))):
    """
    Admin-only endpoint to create users with any role.
    """
    if db.query(User).filter_by(username=user.username).first():
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    if db.query(User).filter_by(email=user.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    rol_final = user.role if user.role in ["admin", "player", "facilitador"] else "player"
    nuevo = User(
        username=user.username,
        email=user.email,
        password=security.get_password_hash(user.password),
        role=rol_final,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    log_action(db, current_user, "CREATE_USER", "User", str(nuevo.id), nuevo.username, {
        "email": nuevo.email,
        "role": nuevo.role,
        "is_active": nuevo.is_active,
        "is_tutor": False,
        "credentials_created": True,
    })
    return {"id": nuevo.id, "username": nuevo.username, "email": nuevo.email, "role": nuevo.role, "is_tutor": False}

@router.get("/", response_model=list | dict)
def get_users(
    paginated: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    all_items: bool = Query(False),
    q: str = Query("", max_length=100),
    status: str = Query("all"),
    role: str = Query("all"),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    query = db.query(User).options(
        joinedload(User.badge_states).joinedload(UserBadgeState.badge)
    )
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(or_(User.username.ilike(pattern), User.email.ilike(pattern), User.role.ilike(pattern)))
    if role != "all":
        query = query.filter(User.role == role)
    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "inactive":
        query = query.filter(User.is_active.is_(False))
    total = query.count()
    if paginated and not all_items:
        query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    else:
        query = query.order_by(User.created_at.desc())
    db_users = query.all()
    session_counts = _session_counts(db, (item.id for item in db_users))
    items = [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
            "reactivation_requested": bool((user.preferences or {}).get("reactivation_requested")),
            "account_deleted": bool((user.preferences or {}).get("account_deleted")),
            "is_tutor": _is_tutor(user),
            "active_sessions": session_counts[user.id]["active"],
            "completed_sessions": session_counts[user.id]["completed"],
        }
        for user in db_users
    ]
    if not paginated:
        return items
    pages = 1 if all_items else max((total + page_size - 1) // page_size, 1)
    return {"items": items, "page": 1 if all_items else page, "page_size": total if all_items else page_size, "total": total, "pages": pages, "all_items": all_items}

@router.put("/{user_id}", response_model=dict)
def update_user(user_id: UUID, update: UserUpdate, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin"))):
    user_db = db.query(User).filter(User.id == user_id).first()
    if not user_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    update_data = update.dict(exclude_unset=True)
    if update_data.get("is_active") and (user_db.preferences or {}).get("account_deleted"):
        raise HTTPException(status_code=409, detail="Una cuenta eliminada no puede reactivarse")
    if update_data.get("is_active"):
        user_db.preferences = {**(user_db.preferences or {}), "reactivation_requested": False}
    credentials_changed = bool(update_data.get("password"))
    tracked_fields = ("username", "email", "role", "is_active")
    previous_values = {
        field: getattr(user_db, field)
        for field in tracked_fields
        if field in update_data
    }

    if "password" in update_data:
        password = update_data["password"]
        if password and isinstance(password, str) and len(password) > 0:
            if len(password) <= 72:
                update_data["password"] = security.get_password_hash(password)
            else:
                raise HTTPException(status_code=400, detail="La contraseña es demasiado larga")
        else:
            # If password is empty string, remove it so we don't overwrite with ""
            del update_data["password"]

    # Log Account Status Changes (Admin)
    if "is_active" in update_data:
        new_status = update_data["is_active"]
        old_status = user_db.is_active

        # Admin Deactivation
        if old_status is True and new_status is False:
             log_action(db, user, "DEACTIVATE_ACCOUNT", "User", str(user_db.id), f"Deactivated {user_db.username}", {
                 "reason": "Admin action via control panel"
             })

        # Admin Reactivation
        elif old_status is False and new_status is True:
             log_action(db, user, "REACTIVATE_ACCOUNT", "User", str(user_db.id), f"Reactivated {user_db.username}", {
                 "reason": "Admin action via control panel"
             })

    for var, value in update_data.items():
        setattr(user_db, var, value)

    db.commit()
    db.refresh(user_db)
    changed_fields = [
        field for field in tracked_fields
        if field in update_data and previous_values.get(field) != getattr(user_db, field)
    ]
    if credentials_changed:
        changed_fields.append("credentials")
    if changed_fields:
        log_action(db, user, "UPDATE_USER", "User", str(user_db.id), user_db.username, {
            "changed_fields": changed_fields,
            "before": previous_values,
            "after": {
                field: getattr(user_db, field)
                for field in tracked_fields
                if field in update_data
            },
            "credentials_changed": credentials_changed,
            "actor_role": user.role,
        })
    return {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "role": user_db.role,
        "is_active": user_db.is_active,
        "is_tutor": _is_tutor(user_db),
    }


@router.get("/admin/{user_id}/profile", response_model=dict)
def get_admin_user_profile(
    user_id: str,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    preferences = target.preferences or {}
    stats = target.stats or {}
    badge_states = [
        state for state in target.badge_states
        if state.status == "approved" and state.badge.is_active
    ]
    session_counts = _session_counts(db, [target.id])[target.id]
    return {
        "id": str(target.id),
        "username": target.username,
        "email": target.email,
        "role": target.role,
        "is_active": target.is_active,
        "is_tutor": _is_tutor(target),
        "avatar_url": preferences.get("avatar_url", ""),
        "nickname": preferences.get("nickname", ""),
        "bio": preferences.get("bio", ""),
        "experience_level": target.experience_level or "beginner",
        "favorite_genres": preferences.get("favorite_genres", []),
        "play_style": preferences.get("play_style", ""),
        "preferred_duration": preferences.get("preferred_duration", ""),
        "preferred_group_size": preferences.get("preferred_group_size", ""),
        "looking_for_players": preferences.get("looking_for_players", False),
        "open_to_events": preferences.get("open_to_events", False),
        "open_to_messages": preferences.get("open_to_messages", False),
        "stats": {
            "rules_viewed": stats.get("rules_viewed", 0),
            "sessions_played": stats.get("sessions_played", 0),
            "games_played": stats.get("games_played", 0),
            "total_time_played": stats.get("total_time_played", 0),
            "favorite_games": len([
                recommendation for recommendation in target.recommendations
                if recommendation.recommendation_type == "favorite"
            ]),
            "active_sessions": session_counts["active"],
            "completed_sessions": session_counts["completed"],
        },
        "badges": [{
            "id": str(state.badge.id),
            "name": state.badge.name,
            "slug": state.badge.slug,
            "image_url": state.badge.image_url or "",
            "is_favorite": state.is_favorite and state.badge.slug != "tutor",
        } for state in badge_states],
        "created_at": target.created_at.isoformat() if target.created_at else None,
        "last_active": target.last_active.isoformat() if target.last_active else None,
    }


@router.get("/community")
def list_community_users(
    page: int = Query(0, ge=0),
    page_size: int = Query(20, ge=1, le=200),
    search: str = Query("", max_length=100),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    query = db.query(User).options(
        joinedload(User.badge_states).joinedload(UserBadgeState.badge)
    ).filter(User.is_active.is_(True))
    if search:
        like = f"%{search}%"
        query = query.filter(
            User.username.ilike(like)
            | User.preferences["nickname"].as_string().ilike(like)
        )
    total = query.count()
    ordered = query.order_by(User.username.asc())
    if page > 0:
        ordered = ordered.offset((page - 1) * page_size).limit(page_size)
    users = ordered.all()
    items = [{
        "id": str(user.id),
        "username": user.username,
        "display_name": (user.preferences or {}).get("nickname") or user.username,
        "avatar_url": (user.preferences or {}).get("avatar_url", ""),
        "is_tutor": _is_tutor(user),
    } for user in users]
    if page > 0:
        pages = max((total + page_size - 1) // page_size, 1)
        return {"items": items, "total": total, "page": page, "pages": pages, "page_size": page_size}
    return items


@router.get("/leaderboard", response_model=dict)
def get_leaderboard(
    db: Session = Depends(deps.get_db),
    sort: str = Query("xp", pattern="^(xp|sessions_played|streak)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    users = db.query(User).filter(User.is_active.is_(True)).all()
    now = date.today()
    entries = []
    for u in users:
        stats = u.stats or {}
        xp = stats.get("xp", 0)
        level = int(math.isqrt(xp // 100)) if xp >= 100 else 0
        entries.append({
            "id": str(u.id),
            "username": u.username,
            "display_name": (u.preferences or {}).get("nickname") or u.username,
            "avatar_url": (u.preferences or {}).get("avatar_url", ""),
            "xp": xp,
            "level": level,
            "sessions_played": stats.get("sessions_played", 0),
            "streak": stats.get("daily_streak", 0),
            "games_played": stats.get("games_played", 0),
        })
    if sort == "xp":
        entries.sort(key=lambda e: (-e["xp"], -e["sessions_played"]))
    elif sort == "sessions_played":
        entries.sort(key=lambda e: (-e["sessions_played"], -e["xp"]))
    elif sort == "streak":
        entries.sort(key=lambda e: (-e["streak"], -e["xp"]))
    for i, e in enumerate(entries):
        e["rank"] = i + 1
    total = len(entries)
    pages = max((total + page_size - 1) // page_size, 1)
    start = (page - 1) * page_size
    return {"items": entries[start:start + page_size], "total": total, "page": page, "pages": pages, "page_size": page_size}


@router.get("/public/{user_id}", response_model=dict)
def get_public_user_profile(
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User | None = Depends(deps.get_optional_user),
):
    target = db.query(User).options(
        joinedload(User.badge_states).joinedload(UserBadgeState.badge),
        joinedload(User.recommendations).joinedload(UserRecommendation.game),
    ).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    preferences = target.preferences or {}
    stats = target.stats or {}
    approved_badges = [
        state for state in target.badge_states
        if state.status == "approved" and state.badge.is_active
    ]
    favorite_games = [
        recommendation for recommendation in target.recommendations
        if recommendation.recommendation_type == "favorite" and recommendation.game
    ]
    return {
        "id": str(target.id),
        "username": target.username,
        "nickname": preferences.get("nickname", ""),
        "avatar_url": preferences.get("avatar_url", ""),
        "bio": preferences.get("bio", ""),
        "is_tutor": _is_tutor(target),
        "experience_level": target.experience_level or "beginner",
        "favorite_genres": preferences.get("favorite_genres", []),
        "play_style": preferences.get("play_style", ""),
        "preferred_duration": preferences.get("preferred_duration", ""),
        "preferred_group_size": preferences.get("preferred_group_size", ""),
        "looking_for_players": preferences.get("looking_for_players", False),
        "open_to_events": preferences.get("open_to_events", False),
        "open_to_messages": preferences.get("open_to_messages", False),
        "stats": {
            "rules_viewed": stats.get("rules_viewed", 0),
            "sessions_played": stats.get("sessions_played", 0),
            "games_played": stats.get("games_played", 0),
            "total_time_played": stats.get("total_time_played", 0),
            "favorite_games": len(favorite_games),
            "xp": stats.get("xp", 0),
            "level": int(math.isqrt(stats.get("xp", 0) // 100)) if stats.get("xp", 0) >= 100 else 0,
            "streak": stats.get("daily_streak", 0),
        },
        "favorite_games": [{
            "id": str(recommendation.game.id),
            "name": recommendation.game.name,
            "image_url": recommendation.game.image_url,
            "playing_time": recommendation.game.playing_time,
        } for recommendation in favorite_games],
        "badges": [{
            "id": str(state.badge.id),
            "name": state.badge.name,
            "slug": state.badge.slug,
            "image_url": state.badge.image_url or "",
            "is_favorite": state.is_favorite and state.badge.slug != "tutor",
        } for state in approved_badges],
        "created_at": target.created_at.isoformat() if target.created_at else None,
        "followers_count": db.query(func.count(user_follows.c.follower_id)).filter(user_follows.c.following_id == target.id).scalar() or 0,
        "following_count": db.query(func.count(user_follows.c.follower_id)).filter(user_follows.c.follower_id == target.id).scalar() or 0,
        "is_following": bool(current_user) and any(
            f.id == target.id for f in current_user.following
        ),
    }

@router.get("/public/{user_id}/sessions", response_model=dict)
def get_public_user_sessions(
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
):
    target = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    query = db.query(GameSession).options(
        joinedload(GameSession.game),
    ).filter(
        GameSession.is_completed.is_(True),
        (GameSession.owner_id == user_id) | (
            GameSession.id.in_(
                db.query(UserGameSession.session_id).filter(
                    UserGameSession.user_id == user_id,
                    UserGameSession.role == "participant",
                )
            )
        ),
    ).order_by(GameSession.end_time.desc())
    total = query.count()
    sessions = query.offset((page - 1) * page_size).limit(page_size).all()
    items = [{
        "id": str(s.id),
        "game_id": str(s.game_id),
        "game_name": s.game.name,
        "game_image_url": s.game.image_url,
        "elapsed_seconds": s.elapsed_seconds or 0,
        "end_time": s.end_time.isoformat() if s.end_time else None,
        "player_count": len(s.players or []),
        "scoring_mode": s.scoring_mode or "individual",
    } for s in sessions]
    pages = max((total + page_size - 1) // page_size, 1)
    return {"items": items, "total": total, "page": page, "pages": pages, "page_size": page_size}

@router.post("/{user_id}/follow", response_model=dict)
def follow_user(
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="No puedes seguirte a ti mismo")
    target = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if any(f.id == target.id for f in current_user.following):
        return {"detail": "Ya sigues a este usuario"}
    current_user.following.append(target)
    db.commit()
    return {"detail": f"Ahora sigues a {target.username}"}

@router.delete("/{user_id}/follow", response_model=dict)
def unfollow_user(
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    target = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    current_user.following = [f for f in current_user.following if f.id != target.id]
    db.commit()
    return {"detail": f"Dejaste de seguir a {target.username}"}

@router.get("/me/following", response_model=dict)
def get_my_following(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    following = db.query(User).join(
        user_follows, User.id == user_follows.c.following_id
    ).filter(
        user_follows.c.follower_id == current_user.id
    ).order_by(user_follows.c.created_at.desc())
    total = following.count()
    items = following.offset((page - 1) * page_size).limit(page_size).all()
    pages = max((total + page_size - 1) // page_size, 1)
    return {
        "items": [{"id": str(u.id), "username": u.username, "display_name": (u.preferences or {}).get("nickname") or u.username, "avatar_url": (u.preferences or {}).get("avatar_url", "")} for u in items],
        "total": total, "page": page, "pages": pages, "page_size": page_size,
    }

@router.get("/me/followers", response_model=dict)
def get_my_followers(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    followers = db.query(User).join(
        user_follows, User.id == user_follows.c.follower_id
    ).filter(
        user_follows.c.following_id == current_user.id
    ).order_by(user_follows.c.created_at.desc())
    total = followers.count()
    items = followers.offset((page - 1) * page_size).limit(page_size).all()
    pages = max((total + page_size - 1) // page_size, 1)
    return {
        "items": [{"id": str(u.id), "username": u.username, "display_name": (u.preferences or {}).get("nickname") or u.username, "avatar_url": (u.preferences or {}).get("avatar_url", "")} for u in items],
        "total": total, "page": page, "pages": pages, "page_size": page_size,
    }

@router.delete("/{user_id}", response_model=dict)
def delete_user(user_id: str, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin"))):
    user_db = db.query(User).filter(User.id == user_id).first()
    if not user_db:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user_db.id == user.id:
        raise HTTPException(status_code=409, detail="No puedes eliminar tu propia cuenta administrativa")
    # Baja lógica: conservar aportes y trazabilidad
    log_action(db, user, "DELETE_USER", "User", str(user_db.id), f"Deleted {user_db.username}", {
        "reason": "Admin logical delete",
        "deleted_user": {
            "username": user_db.username,
            "email": user_db.email,
            "role": user_db.role,
            "is_active": user_db.is_active,
            "is_tutor": _is_tutor(user_db),
        },
        "actor_role": user.role,
    })

    user_db.is_active = False
    user_db.preferences = {**(user_db.preferences or {}), "account_deleted": True}
    db.commit()
    return {"detail": "Cuenta eliminada de forma lógica; sus aportes se conservan"}

@router.get("/me/profile", response_model=dict)
def get_my_profile(current_user: User = Depends(deps.get_current_user)):
    preferences = current_user.preferences or {}
    stats = current_user.stats or {}
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "is_tutor": _is_tutor(current_user),
        "experience_level": current_user.experience_level or "beginner",
        "avatar_url": preferences.get("avatar_url", ""),
        "nickname": preferences.get("nickname", ""),
        "bio": preferences.get("bio", ""),
        "favorite_genres": preferences.get("favorite_genres", []),
        "play_style": preferences.get("play_style", ""),
        "preferred_duration": preferences.get("preferred_duration", ""),
        "preferred_group_size": preferences.get("preferred_group_size", ""),
        "looking_for_players": preferences.get("looking_for_players", False),
        "open_to_events": preferences.get("open_to_events", False),
        "open_to_messages": preferences.get("open_to_messages", False),
        "stats": {
            "rules_viewed": stats.get("rules_viewed", 0),
            "sessions_played": stats.get("sessions_played", 0),
            "games_played": stats.get("games_played", 0),
            "total_time_played": stats.get("total_time_played", 0),
            "xp": stats.get("xp", 0),
            "level": int(math.isqrt(stats.get("xp", 0) // 100)) if stats.get("xp", 0) >= 100 else 0,
            "streak": stats.get("daily_streak", 0),
        },
        "favorite_games": [
            {
                "id": str(recommendation.game.id),
                "name": recommendation.game.name,
                "image_url": recommendation.game.image_url,
                "playing_time": recommendation.game.playing_time,
            }
            for recommendation in current_user.recommendations
            if recommendation.recommendation_type == "favorite" and recommendation.game
        ],
        "created_at": current_user.created_at,
        "last_active": current_user.last_active,
        "notification_preferences": (current_user.preferences or {}).get("notification_preferences", {}),
    }

@router.put("/me/profile", response_model=dict)
def update_my_profile(
    update: UserProfileUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    update_data = update.model_dump(exclude_unset=True)
    nickname = (update_data.get("nickname") or "").strip()
    avatar_url = update_data.get("avatar_url")

    if avatar_url and not (
        avatar_url.startswith("/assets/uploaded_")
        or avatar_url.startswith("/assets/avatars/avatar-")
    ):
        raise HTTPException(status_code=400, detail="La foto de perfil no es válida")

    if nickname:
        if len(nickname) < 3 or len(nickname) > 30:
            raise HTTPException(status_code=400, detail="El nickname debe tener entre 3 y 30 caracteres")
        nickname_owner = next(
            (
                user for user in db.query(User).filter(User.id != current_user.id).all()
                if (user.preferences or {}).get("nickname", "").lower() == nickname.lower()
            ),
            None,
        )
        if nickname_owner:
            raise HTTPException(status_code=400, detail="Ese nickname ya esta en uso")

    experience_level = update_data.pop("experience_level", None)
    if experience_level is not None:
        if experience_level not in {"beginner", "intermediate", "advanced", "expert"}:
            raise HTTPException(status_code=400, detail="Nivel de experiencia no valido")
        current_user.experience_level = experience_level

    preferences = dict(current_user.preferences or {})
    for key, value in update_data.items():
        preferences[key] = value.strip() if isinstance(value, str) else value
    current_user.preferences = preferences

    log_action(db, current_user, "UPDATE_PROFILE", "User", str(current_user.id), current_user.username, {
        "fields": list(update.model_dump(exclude_unset=True).keys())
    })
    db.commit()
    db.refresh(current_user)
    return get_my_profile(current_user)

@router.post("/me/delete-account", response_model=dict)
def logically_delete_account(request: UserDeactivateRequest, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    if not security.verify_password(request.password, current_user.password):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta")
    if current_user.role == "admin":
        raise HTTPException(status_code=409, detail="Solicita a otro administrador que gestione tu baja")
    current_user.is_active = False
    current_user.preferences = {**(current_user.preferences or {}), "account_deleted": True}
    db.commit()
    log_action(db, current_user, "LOGICAL_DELETE_ACCOUNT", "User", current_user.id, current_user.username, {"irreversible": True})
    return {"detail": "Cuenta eliminada de forma lógica; no se puede reactivar"}


@router.post("/me/deactivate", response_model=dict)
def deactivate_account(request: UserDeactivateRequest, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    """
    Deactivate current user account (Soft Delete) with Password Confirmation.
    """
    # Verify password
    if not security.verify_password(request.password, current_user.password):
        raise HTTPException(status_code=400, detail="Contraseña incorrecta")

    current_user.is_active = False

    # Log the action
    log_action(db, current_user, "DEACTIVATE_ACCOUNT", "User", str(current_user.id), current_user.username, {
        "reason": "User requested account deletion (Confirmed via Password)"
    })

    db.commit()
    return {"detail": "Cuenta desactivada correctamente"}

@router.get("/me/notification-preferences", response_model=dict)
def get_notification_preferences(current_user: User = Depends(deps.get_current_user)):
    prefs = (current_user.preferences or {}).get("notification_preferences", {})
    defaults = {
        "manual_report": True,
        "manual_report_resolved": True,
        "new_message": True,
        "table_join_request": True,
        "table_request_approved": True,
        "table_request_rejected": True,
        "table_cancelled": True,
        "table_finished": True,
        "badge_assigned": True,
        "badge_approved": True,
        "badge_rejected": True,
        "badge_revoked": True,
    }
    return {**defaults, **prefs}

@router.put("/me/notification-preferences", response_model=dict)
def update_notification_preferences(
    update: NotificationPreferences,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    preferences = dict(current_user.preferences or {})
    preferences["notification_preferences"] = update.model_dump()
    current_user.preferences = preferences
    db.commit()
    db.refresh(current_user)
    return {"detail": "Preferencias de notificación actualizadas correctamente"}

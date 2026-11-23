from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.api.routers.audit import log_action
from app.models import Game, GameSession, User, UserGameSession
from app.schemas.session import SessionCreate, SessionUpdate
from app.core.time import utc_now
from app.services.gamification import _award_xp, _update_streak, _ensure_auto_badges
from typing import Optional

router = APIRouter()


def _normalize_players(db: Session, players) -> tuple[list[dict], list[UUID]]:
    linked_ids = [player.user_id for player in players if player.user_id]
    if len(linked_ids) != len(set(linked_ids)):
        raise HTTPException(status_code=400, detail="No puedes vincular la misma cuenta dos veces")
    linked_users = {
        user.id: user for user in db.query(User).filter(
            User.id.in_(linked_ids),
            User.is_active.is_(True),
        ).all()
    } if linked_ids else {}
    if len(linked_users) != len(linked_ids):
        raise HTTPException(status_code=400, detail="Uno de los usuarios vinculados no está disponible")

    normalized = []
    for player in players:
        item = player.model_dump(mode="json")
        if player.user_id:
            linked_user = linked_users[player.user_id]
            item["name"] = (linked_user.preferences or {}).get("nickname") or linked_user.username
        normalized.append(item)
    return normalized, linked_ids


def _sync_linked_users(session: GameSession, linked_ids: list[UUID]) -> None:
    session.user_associations = [UserGameSession(user_id=user_id, role="participant") for user_id in linked_ids]


def _session_summary(session: GameSession) -> dict | None:
    if not session.is_completed:
        return None
    sorted_players = sorted(
        session.players or [],
        key=lambda player: float(player.get("score", 0)),
        reverse=True,
    )
    standings = []
    previous_score = None
    previous_position = 0
    for index, player in enumerate(sorted_players):
        score = float(player.get("score", 0))
        position = previous_position if previous_score == score else index + 1
        standings.append({
            **player,
            "position": position,
            "turn_seconds": (session.turn_times or {}).get(player.get("id"), 0),
        })
        previous_score = score
        previous_position = position
    team_standings = []
    if session.scoring_mode == "teams":
        sorted_teams = sorted(session.teams or [], key=lambda team: float(team.get("score", 0)), reverse=True)
        previous_team_score = None
        previous_team_position = 0
        for index, team in enumerate(sorted_teams):
            score = float(team.get("score", 0))
            position = previous_team_position if previous_team_score == score else index + 1
            team_standings.append({
                **team,
                "position": position,
                "members": [player for player in session.players or [] if player.get("team_id") == team.get("id")],
            })
            previous_team_score = score
            previous_team_position = position
    relevant_standings = team_standings if session.scoring_mode == "teams" else standings
    return {
        "standings": standings,
        "podium": [player for player in standings if player["position"] <= 3],
        "team_standings": team_standings,
        "team_podium": [team for team in team_standings if team["position"] <= 3],
        "scoring_mode": session.scoring_mode or "individual",
        "is_tie": len(relevant_standings) > 1 and relevant_standings[0]["score"] == relevant_standings[1]["score"],
        "rounds": session.round_number or 1,
        "elapsed_seconds": session.elapsed_seconds or 0,
        "completed_at": session.end_time.isoformat() if session.end_time else None,
    }


def _serialize(session: GameSession, viewer: Optional[User] = None) -> dict:
    data = {
        "id": str(session.id),
        "game_id": str(session.game_id),
        "game_name": session.game.name,
        "game_image_url": session.game.image_url,
        "players": session.players or [],
        "notes": session.notes or "",
        "snapshots": session.snapshots or [],
        "turn_order": session.turn_order or [],
        "turn_order_enabled": session.turn_order_enabled,
        "round_number": session.round_number or 1,
        "active_player_id": session.active_player_id,
        "elapsed_seconds": session.elapsed_seconds or 0,
        "turn_times": session.turn_times or {},
        "score_history": session.score_history or [],
        "custom_counters": session.custom_counters or [],
        "dice_history": session.dice_history or [],
        "scoring_mode": session.scoring_mode or "individual",
        "teams": session.teams or [],
        "visibility": session.visibility,
        "owner_id": str(session.owner_id) if session.owner_id else None,
        "owner_name": session.owner.username if session.owner else "",
        "status": session.status,
        "is_completed": session.is_completed,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        "summary": _session_summary(session),
    }
    if viewer:
        viewer_assoc = next(
            (assoc for assoc in session.user_associations if assoc.user_id == viewer.id),
            None,
        )
        data["viewer_role"] = viewer_assoc.role if viewer_assoc else None
        data["viewer_color"] = viewer_assoc.color if viewer_assoc else None
    else:
        data["viewer_role"] = None
        data["viewer_color"] = None
    return data


def _owned_session(db: Session, session_id: UUID, user: User) -> GameSession:
    session = (
        db.query(GameSession)
        .options(joinedload(GameSession.game), joinedload(GameSession.owner))
        .filter(GameSession.id == session_id, GameSession.owner_id == user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    return session


def _readable_session(db: Session, session_id: UUID, user: User) -> GameSession:
    session = (
        db.query(GameSession)
        .options(joinedload(GameSession.game), joinedload(GameSession.owner))
        .filter(GameSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if session.owner_id != user.id and session.visibility != "public":
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    return session


@router.get("/", response_model=list[dict])
def list_my_sessions(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    sessions = (
        db.query(GameSession)
        .options(joinedload(GameSession.game), joinedload(GameSession.owner))
        .filter(GameSession.owner_id == user.id)
        .order_by(GameSession.updated_at.desc())
        .all()
    )
    return [_serialize(session) for session in sessions]


@router.get("/public", response_model=list[dict])
def list_public_sessions(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    sessions = (
        db.query(GameSession)
        .options(joinedload(GameSession.game), joinedload(GameSession.owner))
        .filter(
            GameSession.visibility == "public",
            GameSession.is_completed == False,
            GameSession.status == "active",
        )
        .order_by(GameSession.updated_at.desc())
        .all()
    )
    return [_serialize(session, viewer=user) for session in sessions]


@router.get("/{session_id}", response_model=dict)
def get_session(
    session_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    session = _readable_session(db, session_id, user)
    return _serialize(session, viewer=user)


@router.post("/{session_id}/follow", response_model=dict)
def follow_session(
    session_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    session = _readable_session(db, session_id, user)
    existing = (
        db.query(UserGameSession)
        .filter(
            UserGameSession.user_id == user.id,
            UserGameSession.session_id == session.id,
        )
        .first()
    )
    if existing:
        return {"detail": "Ya estás siguiendo esta partida"}
    db.add(UserGameSession(user_id=user.id, session_id=session.id, role="viewer"))
    db.commit()
    return {"detail": "Ahora estás siguiendo esta partida"}


@router.post("/{session_id}/unfollow", response_model=dict)
def unfollow_session(
    session_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    existing = (
        db.query(UserGameSession)
        .filter(
            UserGameSession.user_id == user.id,
            UserGameSession.session_id == session_id,
        )
        .first()
    )
    if not existing:
        return {"detail": "No estabas siguiendo esta partida"}
    if existing.role == "participant":
        raise HTTPException(status_code=400, detail="No puedes dejar de seguir una partida en la que participas")
    db.delete(existing)
    db.commit()
    return {"detail": "Dejaste de seguir la partida"}


@router.post("/{session_id}/color", response_model=dict)
def set_viewer_color(
    session_id: UUID,
    color: str = Body(default="#3c8dbc"),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    session = _readable_session(db, session_id, user)
    assoc = (
        db.query(UserGameSession)
        .filter(
            UserGameSession.user_id == user.id,
            UserGameSession.session_id == session.id,
        )
        .first()
    )
    if assoc:
        assoc.color = color
    else:
        db.add(UserGameSession(user_id=user.id, session_id=session.id, role="viewer", color=color))
    db.commit()
    return {"color": color}


@router.post("/", response_model=dict)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    game = db.query(Game).filter(Game.id == payload.game_id, Game.is_active.is_(True)).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")
    players, linked_ids = _normalize_players(db, payload.players)
    now = utc_now()
    session = GameSession(
        game_id=game.id,
        owner_id=user.id,
        players=players,
        notes=payload.notes.strip(),
        snapshots=payload.snapshots,
        turn_order=payload.turn_order,
        turn_order_enabled=payload.turn_order_enabled,
        round_number=payload.round_number,
        active_player_id=payload.active_player_id,
        elapsed_seconds=payload.elapsed_seconds,
        turn_times=payload.turn_times,
        score_history=payload.score_history[-100:],
        custom_counters=[counter.model_dump(mode="json") for counter in payload.custom_counters],
        dice_history=[roll.model_dump(mode="json") for roll in payload.dice_history[-50:]],
        scoring_mode=payload.scoring_mode,
        teams=[team.model_dump(mode="json") for team in payload.teams],
        visibility=payload.visibility,
        status="active",
        is_completed=False,
        start_time=now,
        expires_at=now + timedelta(days=30),
    )
    _sync_linked_users(session, linked_ids)
    db.add(session)
    db.commit()
    db.refresh(session)
    session.game = game
    log_action(db, user, "CREATE", "GameSession", session.id, game.name, {
        "players": len(session.players),
        "visibility": payload.visibility,
        "expires_at": session.expires_at.isoformat(),
    })
    return _serialize(session)


@router.put("/{session_id}", response_model=dict)
def update_session(
    session_id: UUID,
    payload: SessionUpdate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    session = _owned_session(db, session_id, user)
    if session.is_completed:
        raise HTTPException(status_code=400, detail="La partida ya está finalizada")
    changes = payload.model_dump(exclude_unset=True)
    if "players" in changes:
        changes["players"], linked_ids = _normalize_players(db, payload.players)
        _sync_linked_users(session, linked_ids)
    if "notes" in changes:
        changes["notes"] = changes["notes"].strip()
    if "score_history" in changes:
        changes["score_history"] = changes["score_history"][-100:]
    if "dice_history" in changes:
        changes["dice_history"] = changes["dice_history"][-50:]
    for field, value in changes.items():
        setattr(session, field, value)
    session.expires_at = utc_now() + timedelta(days=30)
    db.commit()
    db.refresh(session)
    log_action(db, user, "UPDATE", "GameSession", session.id, session.game.name, {
        "fields": list(changes.keys()),
    })
    return _serialize(session)


@router.post("/{session_id}/complete", response_model=dict)
def complete_session(
    session_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    session = _owned_session(db, session_id, user)
    session.status = "completed"
    session.is_completed = True
    session.end_time = utc_now()
    session.expires_at = None
    participant_ids = {association.user_id for association in session.user_associations}
    participant_ids.add(user.id)
    participants = db.query(User).filter(User.id.in_(participant_ids)).all()
    for participant in participants:
        stats = dict(participant.stats or {})
        stats["sessions_played"] = stats.get("sessions_played", 0) + 1
        played_games = set(stats.get("games_played_ids", []))
        played_games.add(str(session.game_id))
        stats["games_played_ids"] = list(played_games)
        stats["games_played"] = len(played_games)
        elapsed = session.elapsed_seconds or 0
        stats["total_time_played"] = stats.get("total_time_played", 0) + elapsed
        participant.stats = stats
        xp_reward = 50 if participant.id == user.id else 30
        _award_xp(participant, db, xp_reward, "Partida completada")
        _update_streak(participant, db)
        _ensure_auto_badges(participant, db)
    db.commit()
    db.refresh(session)
    log_action(db, user, "COMPLETE", "GameSession", session.id, session.game.name)
    return _serialize(session)


@router.delete("/{session_id}", response_model=dict)
def delete_session(
    session_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    session = _owned_session(db, session_id, user)
    game_name = session.game.name
    db.delete(session)
    db.commit()
    log_action(db, user, "DELETE", "GameSession", session_id, game_name)
    return {"detail": "Partida eliminada"}

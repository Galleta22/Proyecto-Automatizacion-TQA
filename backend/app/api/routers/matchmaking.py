from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.api.routers.audit import log_action
from app.models import Game, MatchRequest, MatchTable, User, UserBadgeState
from app.services.notifications import notify
from app.core.time import utc_now

router = APIRouter()


def _as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class TablePayload(BaseModel):
    game_id: UUID
    title: str = Field(min_length=3, max_length=150)
    scheduled_at: datetime
    location: str = Field(min_length=3, max_length=180)
    capacity: int = Field(ge=2, le=20)
    notes: str = Field(default="", max_length=1500)
    tutor_mode: str = "none"

    @field_validator("title", "location")
    @classmethod
    def clean_required_text(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Texto muy corto.")
        return value

    @field_validator("tutor_mode")
    @classmethod
    def valid_tutor_mode(cls, value):
        if value not in {"none", "explain", "play"}:
            raise ValueError("Modalidad de tutor no válida")
        return value


class JoinPayload(BaseModel):
    message: str = Field(default="", max_length=300)


class ReviewPayload(BaseModel):
    status: str


def _display_name(user: User) -> str:
    return (user.preferences or {}).get("nickname") or user.username


def _is_tutor(user: User) -> bool:
    return any(
        state.status == "approved"
        and state.badge
        and state.badge.slug == "tutor"
        and state.badge.is_active
        for state in user.badge_states
    )


def _approved_requests(table: MatchTable) -> list[MatchRequest]:
    return [request for request in table.requests if request.status == "approved"]


def _playing_requests(table: MatchTable) -> list[MatchRequest]:
    return [request for request in _approved_requests(table) if request.participation_type != "tutor_explain"]


def _tutor_will_play(table: MatchTable) -> bool:
    return _is_tutor(table.host) or any(_is_tutor(request.user) for request in _playing_requests(table))


def _tutor_will_explain(table: MatchTable) -> bool:
    return any(request.participation_type == "tutor_explain" for request in _approved_requests(table))


def _request_kind(table: MatchTable, user: User) -> str:
    if not _is_tutor(user):
        return "player"
    if table.tutor_mode == "explain" and not (_tutor_will_play(table) or _tutor_will_explain(table)):
        return "tutor_explain"
    if table.tutor_mode == "play" and not _tutor_will_play(table):
        return "tutor_play"
    return "player"


def _game_genres(game: Game) -> list[str]:
    genres = [category.name for category in game.categories]
    genres.extend((game.game_metadata or {}).get("categories") or [])
    return list(dict.fromkeys(genre.strip() for genre in genres if isinstance(genre, str) and genre.strip()))


def _serialize(table: MatchTable, current_user: User) -> dict:
    approved = _approved_requests(table)
    playing = _playing_requests(table)
    my_request = next((request for request in table.requests if request.user_id == current_user.id), None)
    may_view_participants = table.host_id == current_user.id or bool(my_request and my_request.status == "approved")
    tutor_will_play = _tutor_will_play(table)
    tutor_will_explain = _tutor_will_explain(table)
    occupied_spots = 1 + len(playing)
    request_kind = _request_kind(table, current_user)
    reserved_tutor_spot = table.tutor_mode == "play" and not tutor_will_play
    can_request = table.host_id != current_user.id and not my_request and (
        request_kind == "tutor_explain"
        or (occupied_spots < table.capacity and not (reserved_tutor_spot and request_kind == "player" and occupied_spots >= table.capacity - 1))
    )
    participants = [{
        "user_id": str(table.host_id),
        "user_name": _display_name(table.host),
        "is_host": True,
        "is_tutor": _is_tutor(table.host),
    }, *[{
        "user_id": str(request.user_id),
        "user_name": _display_name(request.user),
        "is_host": False,
        "is_tutor": _is_tutor(request.user),
    } for request in playing]]
    return {
        "id": str(table.id),
        "title": table.title,
        "game_id": str(table.game_id),
        "game_name": table.game.name,
        "game_image_url": table.game.image_url,
        "game_genres": _game_genres(table.game),
        "host_id": str(table.host_id),
        "host_name": _display_name(table.host),
        "scheduled_at": table.scheduled_at.isoformat(),
        "location": table.location,
        "capacity": table.capacity,
        "approved_count": len(playing),
        "available_spots": max(table.capacity - occupied_spots, 0),
        "notes": table.notes or "",
        "tutor_mode": table.tutor_mode,
        "status": table.status,
        "is_owner": table.host_id == current_user.id,
        "my_request": my_request.status if my_request else None,
        "my_participation_type": my_request.participation_type if my_request else None,
        "tutor_will_play": tutor_will_play,
        "tutor_will_explain": tutor_will_explain,
        "request_kind": request_kind,
        "can_request": can_request,
        "participants": participants if may_view_participants else [],
        "tutor_explainers": [{
            "user_id": str(request.user_id),
            "user_name": _display_name(request.user),
        } for request in approved if request.participation_type == "tutor_explain"] if may_view_participants else [],
        "requests": [{
            "id": str(request.id),
            "user_id": str(request.user_id),
            "user_name": _display_name(request.user),
            "message": request.message,
            "participation_type": request.participation_type,
            "is_tutor": _is_tutor(request.user),
            "status": request.status,
        } for request in table.requests] if table.host_id == current_user.id else [],
    }


def _table_query(db: Session):
    return db.query(MatchTable).options(
        joinedload(MatchTable.game).joinedload(Game.categories),
        joinedload(MatchTable.host).joinedload(User.badge_states).joinedload(UserBadgeState.badge),
        joinedload(MatchTable.requests).joinedload(MatchRequest.user).joinedload(User.badge_states).joinedload(UserBadgeState.badge),
    )


def _auto_finish_overdue_tables(db: Session) -> None:
    try:
        cutoff = utc_now()
        overdue = db.query(MatchTable).options(
            joinedload(MatchTable.requests),
        ).filter(
            MatchTable.status.in_(["open", "full"]),
            MatchTable.scheduled_at < cutoff,
        ).all()
        for table in overdue:
            hours_passed = (cutoff - table.scheduled_at).total_seconds() / 3600
            if hours_passed >= 2:
                table.status = "finished"
                for request in table.requests:
                    if request.status in {"pending", "approved"}:
                        notify(db, request.user_id, "table_finished", "Mesa finalizada", f"La mesa {table.title} ha finalizado.", "/mesas")
        if overdue:
            db.commit()
    except Exception:
        db.rollback()


@router.get("/", response_model=list[dict])
def list_tables(
    game_id: Optional[UUID] = Query(None),
    genre: Optional[str] = Query(None, min_length=1, max_length=100),
    tutor_mode: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    _auto_finish_overdue_tables(db)
    query = _table_query(db).filter(
        MatchTable.status.in_(["open", "full"]),
        MatchTable.scheduled_at >= utc_now(),
    )
    if game_id:
        query = query.filter(MatchTable.game_id == game_id)
    if tutor_mode:
        query = query.filter(MatchTable.tutor_mode == tutor_mode)
    tables = query.order_by(MatchTable.scheduled_at.asc()).all()
    if genre:
        normalized_genre = genre.strip().casefold()
        tables = [
            table for table in tables
            if any(item.casefold() == normalized_genre for item in _game_genres(table.game))
        ]
    return [_serialize(table, user) for table in tables]


@router.post("/", response_model=dict)
def create_table(
    payload: TablePayload,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    scheduled_at = _as_utc_naive(payload.scheduled_at)
    if scheduled_at <= utc_now():
        raise HTTPException(status_code=400, detail="La fecha debe estar en el futuro")
    game = db.query(Game).filter(Game.id == payload.game_id, Game.is_active.is_(True)).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")
    table = MatchTable(
        host_id=user.id,
        game_id=game.id,
        title=payload.title.strip(),
        scheduled_at=scheduled_at,
        location=payload.location.strip(),
        capacity=payload.capacity,
        notes=payload.notes.strip(),
        tutor_mode=payload.tutor_mode,
    )
    db.add(table)
    db.commit()
    table = _table_query(db).filter(MatchTable.id == table.id).first()
    log_action(db, user, "CREATE", "MatchTable", table.id, table.title, {"game": game.name, "capacity": table.capacity})
    return _serialize(table, user)


@router.post("/{table_id}/request", response_model=dict)
def request_join(
    table_id: UUID,
    payload: JoinPayload,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    table = _table_query(db).filter(MatchTable.id == table_id).first()
    if not table or table.status not in {"open", "full"}:
        raise HTTPException(status_code=404, detail="Mesa no disponible")
    if table.host_id == user.id:
        raise HTTPException(status_code=400, detail="Ya eres anfitrión de esta mesa")
    existing = db.query(MatchRequest).filter(MatchRequest.table_id == table.id, MatchRequest.user_id == user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya enviaste una solicitud")
    participation_type = _request_kind(table, user)
    occupied_spots = 1 + len(_playing_requests(table))
    if participation_type != "tutor_explain" and occupied_spots >= table.capacity:
        raise HTTPException(status_code=400, detail="La mesa ya no tiene cupos")
    if table.tutor_mode == "play" and not _tutor_will_play(table) and participation_type == "player" and occupied_spots >= table.capacity - 1:
        raise HTTPException(status_code=400, detail="El cupo restante está reservado para un tutor")
    request = MatchRequest(
        table_id=table.id,
        user_id=user.id,
        message=payload.message.strip(),
        participation_type=participation_type,
    )
    db.add(request)
    db.commit()
    notify(
        db,
        table.host_id,
        "table_join_request",
        "Nueva solicitud para tu mesa",
        f"{_display_name(user)} quiere {'explicar el juego en' if participation_type == 'tutor_explain' else 'unirse a'} {table.title}.",
        "/comunidad",
    )
    log_action(db, user, "REQUEST_JOIN", "MatchTable", table.id, table.title)
    return {"detail": "Solicitud enviada"}


@router.put("/requests/{request_id}", response_model=dict)
def review_request(
    request_id: UUID,
    payload: ReviewPayload,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    if payload.status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Estado no válido")
    request = db.query(MatchRequest).options(joinedload(MatchRequest.table)).filter(MatchRequest.id == request_id).first()
    if not request or request.table.host_id != user.id or request.status != "pending":
        raise HTTPException(status_code=404, detail="Solicitud no disponible")
    table = _table_query(db).filter(MatchTable.id == request.table_id).first()
    playing_count = len(_playing_requests(table))
    occupied_spots = 1 + playing_count
    if payload.status == "approved" and request.participation_type != "tutor_explain":
        if occupied_spots >= table.capacity:
            raise HTTPException(status_code=400, detail="La mesa ya no tiene cupos")
        if table.tutor_mode == "play" and not _tutor_will_play(table) and request.participation_type == "player" and occupied_spots >= table.capacity - 1:
            raise HTTPException(status_code=400, detail="El cupo restante está reservado para un tutor")
    request.status = payload.status
    request.reviewed_at = utc_now()
    db.commit()
    if payload.status == "approved" and request.participation_type != "tutor_explain":
        occupied_spots += 1
    table.status = "full" if occupied_spots >= table.capacity else "open"
    db.commit()
    notify(
        db,
        request.user_id,
        "table_request_approved" if payload.status == "approved" else "table_request_rejected",
        "Solicitud de mesa aprobada" if payload.status == "approved" else "Solicitud de mesa rechazada",
        f"Tu solicitud para {request.table.title} fue {'aprobada' if payload.status == 'approved' else 'rechazada'}.",
        "/mesas",
    )
    log_action(db, user, "APPROVE_JOIN" if payload.status == "approved" else "REJECT_JOIN", "MatchTable", request.table.id, request.table.title)
    return {"detail": "Solicitud actualizada"}


@router.put("/{table_id}/finish", response_model=dict)
def finish_table(
    table_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    table = db.query(MatchTable).filter(MatchTable.id == table_id, MatchTable.host_id == user.id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    if table.status not in {"open", "full"}:
        raise HTTPException(status_code=400, detail="La mesa ya no está activa")
    table.status = "finished"
    for request in table.requests:
        if request.status in {"pending", "approved"}:
            notify(db, request.user_id, "table_finished", "Mesa finalizada", f"La mesa {table.title} fue finalizada por el anfitrión.", "/mesas")
    db.commit()
    log_action(db, user, "FINISH", "MatchTable", table.id, table.title)
    return {"detail": "Mesa finalizada"}


@router.delete("/{table_id}", response_model=dict)
def cancel_table(
    table_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    table = db.query(MatchTable).filter(MatchTable.id == table_id, MatchTable.host_id == user.id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    table.status = "cancelled"
    participant_ids = {request.user_id for request in table.requests if request.status in {"pending", "approved"}}
    for participant_id in participant_ids:
        notify(
            db,
            participant_id,
            "table_cancelled",
            "Mesa cancelada",
            f"La mesa {table.title} fue cancelada por el anfitrión.",
            "/mesas",
        )
    db.commit()
    log_action(db, user, "CANCEL", "MatchTable", table.id, table.title)
    return {"detail": "Mesa cancelada"}

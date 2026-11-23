from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.api.routers.audit import log_action
from app.models import Game, GameTip, User
from app.schemas.tip import TipCreate, TipUpdate

router = APIRouter()


def _can_manage(tip: GameTip, user: Optional[User]) -> bool:
    return bool(user and (tip.user_id == user.id or user.role == "admin"))


def _serialize_tip(tip: GameTip, user: Optional[User]) -> dict:
    preferences = tip.user.preferences or {}
    author_name = preferences.get("nickname") or tip.user.username
    return {
        "id": str(tip.id),
        "game_id": str(tip.game_id),
        "user_id": str(tip.user_id),
        "category": tip.category,
        "content": tip.content,
        "author": author_name,
        "created_at": tip.created_at.isoformat() if tip.created_at else None,
        "can_edit": _can_manage(tip, user),
        "can_delete": _can_manage(tip, user),
    }


@router.get("/game/{game_id}", response_model=List[dict])
def list_game_tips(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: Optional[User] = Depends(deps.get_optional_user),
):
    tips = (
        db.query(GameTip)
        .options(joinedload(GameTip.user))
        .filter(GameTip.game_id == game_id)
        .order_by(GameTip.created_at.desc())
        .all()
    )
    return [_serialize_tip(tip, user) for tip in tips]


@router.post("/game/{game_id}", response_model=dict)
def create_game_tip(
    game_id: str,
    payload: TipCreate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id, Game.is_active.is_(True)).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    tip = GameTip(
        game_id=game.id,
        user_id=user.id,
        category=payload.category,
        content=payload.content,
    )
    db.add(tip)
    db.commit()
    db.refresh(tip)
    tip.user = user

    log_action(db, user, "CREATE", "GameTip", tip.id, game.name, {
        "game_id": str(game.id),
        "category": tip.category,
    })
    return _serialize_tip(tip, user)


@router.put("/{tip_id}", response_model=dict)
def update_game_tip(
    tip_id: str,
    payload: TipUpdate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    tip = db.query(GameTip).options(joinedload(GameTip.user)).filter(GameTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip no encontrado")
    if not _can_manage(tip, user):
        raise HTTPException(status_code=403, detail="No puedes editar este tip")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(tip, field, value)
    db.commit()
    db.refresh(tip)

    log_action(db, user, "UPDATE", "GameTip", tip.id, None, {
        "game_id": str(tip.game_id),
        "fields": list(changes.keys()),
    })
    return _serialize_tip(tip, user)


@router.delete("/{tip_id}", response_model=dict)
def delete_game_tip(
    tip_id: str,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    tip = db.query(GameTip).filter(GameTip.id == tip_id).first()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip no encontrado")
    if not _can_manage(tip, user):
        raise HTTPException(status_code=403, detail="No puedes eliminar este tip")

    game_id = str(tip.game_id)
    db.delete(tip)
    db.commit()
    log_action(db, user, "DELETE", "GameTip", tip_id, None, {"game_id": game_id})
    return {"detail": "Tip eliminado"}

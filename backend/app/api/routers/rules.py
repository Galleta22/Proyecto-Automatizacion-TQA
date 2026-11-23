from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api import deps
from app.api.routers.audit import log_action
from app.models import Rule, User
from app.schemas.rule import RuleCreate, RuleUpdate
from app.services.gamification import _award_xp, _update_streak, _ensure_auto_badges

router = APIRouter()

GLOBAL_ROLES = {"admin", "facilitador"}


def _validate_source(is_official, source):
    valid_sources = {True: {"bgg", "admin"}, False: {"house", "community"}}
    if source not in valid_sources.get(is_official, set()):
        raise HTTPException(status_code=422, detail="El origen debe corresponder al tipo de regla.")


def _validate_visibility(visibility: str) -> str:
    if visibility not in {"global", "private"}:
        raise HTTPException(status_code=422, detail="Visibilidad de regla no válida")
    return visibility


def _can_edit(rule: Rule, user: Optional[User]) -> bool:
    if not user:
        return False
    if rule.visibility == "private":
        return rule.added_by_id == user.id
    return user.role in GLOBAL_ROLES


def _can_delete(rule: Rule, user: Optional[User]) -> bool:
    if not user:
        return False
    if rule.visibility == "private":
        return rule.added_by_id == user.id
    return user.role == "admin"


def _serialize_rule(rule: Rule, user: Optional[User]) -> dict:
    return {
        "id": str(rule.id),
        "title": rule.title,
        "content": rule.content,
        "rule_type": rule.rule_type,
        "game_id": str(rule.game_id),
        "is_official": rule.is_official,
        "source": rule.source,
        "visibility": rule.visibility,
        "added_by_id": str(rule.added_by_id) if rule.added_by_id else None,
        "can_edit": _can_edit(rule, user),
        "can_delete": _can_delete(rule, user),
    }


@router.get("/", response_model=List[dict])
def list_rules(
    db: Session = Depends(deps.get_db),
    user: Optional[User] = Depends(deps.get_optional_user),
):
    query = db.query(Rule)
    if user and user.role == "admin":
        pass
    elif user:
        query = query.filter(or_(Rule.visibility == "global", Rule.added_by_id == user.id))
    else:
        query = query.filter(Rule.visibility == "global")
    rules = query.all()
    if user:
        stats = dict(user.stats or {})
        stats["rules_viewed"] = stats.get("rules_viewed", 0) + 1
        user.stats = stats
        _award_xp(user, db, 5, "Regla consultada")
        _update_streak(user, db)
        _ensure_auto_badges(user, db)
        db.commit()
    return [_serialize_rule(rule, user) for rule in rules]


@router.post("/", response_model=dict)
def create_rule(
    rule: RuleCreate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    visibility = _validate_visibility(rule.visibility)
    if visibility == "global" and user.role not in GLOBAL_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Sólo administradores y facilitadores pueden crear reglas globales",
        )

    _validate_source(rule.is_official, rule.source)
    new_rule = Rule(
        title=rule.title,
        content=rule.content,
        rule_type=rule.rule_type,
        game_id=rule.game_id,
        is_official=rule.is_official,
        source=rule.source,
        visibility=visibility,
        added_by_id=user.id,
    )
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)

    log_action(db, user, "CREATE", "Rule", new_rule.id, new_rule.title, {
        "game_id": str(new_rule.game_id),
        "rule_type": new_rule.rule_type,
        "is_official": new_rule.is_official,
        "source": new_rule.source,
        "visibility": new_rule.visibility,
    })
    return _serialize_rule(new_rule, user)


@router.put("/{rule_id}", response_model=dict)
def update_rule(
    rule_id: UUID,
    update: RuleUpdate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    rule = db.query(Rule).filter(Rule.id == rule_id).first()
    if not rule or (rule.visibility == "private" and rule.added_by_id != user.id):
        raise HTTPException(status_code=404, detail="Regla no encontrada")
    if not _can_edit(rule, user):
        raise HTTPException(status_code=403, detail="No puedes editar esta regla")

    changes = update.model_dump(exclude_unset=True)
    if "source" in changes or "is_official" in changes:
        _validate_source(changes.get("is_official", rule.is_official), changes.get("source", rule.source))
    if "visibility" in changes:
        changes["visibility"] = _validate_visibility(changes["visibility"])
        if changes["visibility"] == "global" and user.role not in GLOBAL_ROLES:
            raise HTTPException(
                status_code=403,
                detail="No puedes convertir una regla privada en global",
            )

    from app.models import ContentRevision
    old_values = {field: getattr(rule, field) for field in changes}
    db.add(ContentRevision(entity_type="rule", entity_id=rule.id, entity_name=rule.title, user_id=user.id, before=old_values, after=changes))
    for field, value in changes.items():
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)

    log_action(db, user, "UPDATE", "Rule", rule.id, rule.title, {
        "old_values": old_values,
        "new_values": changes,
        "visibility": rule.visibility,
    })
    return _serialize_rule(rule, user)


@router.delete("/{rule_id}", response_model=dict)
def delete_rule(
    rule_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    rule = db.query(Rule).filter(Rule.id == rule_id).first()
    if not rule or (rule.visibility == "private" and rule.added_by_id != user.id):
        raise HTTPException(status_code=404, detail="Regla no encontrada")
    if not _can_delete(rule, user):
        raise HTTPException(status_code=403, detail="No puedes eliminar esta regla")

    rule_title = rule.title
    rule_game_id = str(rule.game_id)
    visibility = rule.visibility
    db.delete(rule)
    db.commit()

    log_action(db, user, "DELETE", "Rule", rule_id, rule_title, {
        "game_id": rule_game_id,
        "visibility": visibility,
    })
    return {"detail": "Regla eliminada"}

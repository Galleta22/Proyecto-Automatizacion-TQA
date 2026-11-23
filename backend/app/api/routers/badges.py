import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.api.routers.audit import log_action
from app.models import Badge, User, UserBadgeState
from app.services.gamification import BADGE_MILESTONES
from app.services.notifications import notify, notify_admins
from app.core.time import utc_now

router = APIRouter()
VALID_STATUSES = {"eligible", "pending", "approved", "rejected"}


class BadgePayload(BaseModel):
    name: str
    description: str = ""
    image_url: str = ""
    is_active: bool = True


class ReviewPayload(BaseModel):
    status: str


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "insignia"


def _badge_dict(badge: Badge, state: UserBadgeState | None = None) -> dict:
    return {
        "id": str(badge.id),
        "name": badge.name,
        "slug": badge.slug,
        "description": badge.description or "",
        "image_url": badge.image_url or "",
        "is_active": badge.is_active,
        "is_system": badge.is_system,
        "status": state.status if state else None,
        "is_favorite": bool(state.is_favorite) if state else False,
    }


@router.get("/me")
def my_badges(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    states = (
        db.query(UserBadgeState)
        .options(joinedload(UserBadgeState.badge))
        .filter(UserBadgeState.user_id == user.id)
        .all()
    )
    by_badge = {state.badge_id: state for state in states}
    badges = db.query(Badge).filter(Badge.is_active.is_(True)).order_by(Badge.created_at.asc()).all()
    result = []
    for badge in badges:
        state = by_badge.get(badge.id)
        if badge.slug != "tutor" and not state:
            continue
        item = _badge_dict(badge, state)
        if badge.slug == "tutor" and not state:
            item["status"] = "eligible"
        result.append(item)
    return result


@router.put("/{badge_id}/favorite")
def set_favorite_badge(
    badge_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    state = db.query(UserBadgeState).options(joinedload(UserBadgeState.badge)).filter(
        UserBadgeState.user_id == user.id,
        UserBadgeState.badge_id == badge_id,
        UserBadgeState.status == "approved",
    ).first()
    if not state:
        raise HTTPException(status_code=400, detail="Solo puedes destacar una insignia aprobada")
    if state.badge.slug == "tutor":
        raise HTTPException(status_code=400, detail="La insignia Tutor no puede marcarse como favorita")
    if state.is_favorite:
        state.is_favorite = False
        db.commit()
        log_action(db, user, "UNFAVORITE_BADGE", "Badge", badge_id, state.badge.name)
        return {"detail": "Insignia favorita retirada", "is_favorite": False}
    db.query(UserBadgeState).filter(
        UserBadgeState.user_id == user.id,
        UserBadgeState.id != state.id,
    ).update({"is_favorite": False}, synchronize_session=False)
    state.is_favorite = True
    db.commit()
    log_action(db, user, "FAVORITE_BADGE", "Badge", badge_id, state.badge.name)
    return {"detail": "Insignia favorita actualizada", "is_favorite": True}


@router.post("/{badge_id}/request")
def request_badge(
    badge_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    badge = db.query(Badge).filter(Badge.id == badge_id, Badge.is_active.is_(True)).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Insignia no encontrada")
    state = db.query(UserBadgeState).filter(
        UserBadgeState.user_id == user.id,
        UserBadgeState.badge_id == badge_id,
    ).first()
    if not state and badge.slug == "tutor":
        state = UserBadgeState(user_id=user.id, badge_id=badge.id, status="pending")
        db.add(state)
    elif not state or state.status not in {"eligible", "rejected"}:
        raise HTTPException(status_code=400, detail="Esta insignia no está habilitada para solicitar")
    else:
        state.status = "pending"
    state.requested_at = utc_now()
    state.reviewed_at = None
    state.reviewed_by_id = None
    db.commit()
    notify_admins(
        db,
        "badge_request",
        "Nueva solicitud de insignia",
        f"{user.username} solicitó la insignia {badge.name}.",
        "/admin",
    )
    log_action(db, user, "REQUEST_BADGE", "Badge", badge_id, badge.name)
    return {"detail": "Solicitud enviada", "status": state.status}


@router.get("/admin")
def admin_badges(
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    badges = db.query(Badge).order_by(Badge.created_at.asc()).all()
    users = db.query(User).order_by(User.username.asc()).all()
    states = (
        db.query(UserBadgeState)
        .options(joinedload(UserBadgeState.user))
        .all()
    )
    by_badge = {}
    for state in states:
        by_badge.setdefault(str(state.badge_id), []).append({
            "id": str(state.id),
            "user_id": str(state.user_id),
            "username": state.user.username,
            "email": state.user.email,
            "status": state.status,
            "requested_at": state.requested_at.isoformat() if state.requested_at else None,
        })
    return {
        "automatic_badges": [
            {field: milestone[field] for field in ("slug", "name", "description")}
            for milestone in BADGE_MILESTONES.values()
        ],
        "badges": [{**_badge_dict(badge), "states": by_badge.get(str(badge.id), [])} for badge in badges],
        "users": [{"id": str(user.id), "username": user.username, "email": user.email} for user in users],
    }


@router.post("/admin")
def create_badge(
    payload: BadgePayload,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="El nombre debe tener al menos 2 caracteres")
    base_slug = _slugify(name)
    slug = base_slug
    suffix = 2
    while db.query(Badge).filter(Badge.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    badge = Badge(
        name=name,
        slug=slug,
        description=payload.description.strip(),
        image_url=payload.image_url.strip() or None,
        is_active=payload.is_active,
        is_system=False,
    )
    db.add(badge)
    db.commit()
    db.refresh(badge)
    log_action(db, admin, "CREATE", "Badge", badge.id, badge.name)
    return _badge_dict(badge)


@router.put("/admin/{badge_id}")
def update_badge(
    badge_id: UUID,
    payload: BadgePayload,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Insignia no encontrada")
    if badge.is_system and (payload.name.strip() != badge.name or not payload.is_active):
        raise HTTPException(status_code=400, detail="La insignia Tutor es permanente y debe permanecer activa")
    duplicate = db.query(Badge).filter(func.lower(Badge.name) == payload.name.strip().lower(), Badge.id != badge.id).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Ya existe una insignia con ese nombre")
    badge.name = payload.name.strip()
    badge.description = payload.description.strip()
    badge.image_url = payload.image_url.strip() or None
    badge.is_active = payload.is_active
    db.commit()
    log_action(db, admin, "UPDATE", "Badge", badge.id, badge.name)
    return _badge_dict(badge)


@router.delete("/admin/{badge_id}")
def delete_badge(
    badge_id: UUID,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Insignia no encontrada")
    if badge.is_system:
        raise HTTPException(status_code=400, detail="La insignia Tutor es permanente y no puede eliminarse")
    name = badge.name
    db.delete(badge)
    db.commit()
    log_action(db, admin, "DELETE", "Badge", badge_id, name)
    return {"detail": "Insignia eliminada"}


@router.put("/admin/{badge_id}/eligibility/{user_id}")
def toggle_eligibility(
    badge_id: UUID,
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not badge or not target:
        raise HTTPException(status_code=404, detail="Insignia o usuario no encontrado")
    state = db.query(UserBadgeState).filter(
        UserBadgeState.badge_id == badge.id,
        UserBadgeState.user_id == target.id,
    ).first()
    if state and state.status in {"pending", "approved"}:
        raise HTTPException(status_code=400, detail="El usuario ya tiene una solicitud o insignia activa")
    if state:
        db.delete(state)
        detail = "Habilitación retirada"
    else:
        db.add(UserBadgeState(user_id=target.id, badge_id=badge.id, status="eligible"))
        detail = "Usuario habilitado"
    db.commit()
    return {"detail": detail}


@router.put("/admin/{badge_id}/assignment/{user_id}")
def toggle_assignment(
    badge_id: UUID,
    user_id: UUID,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    badge = db.query(Badge).filter(Badge.id == badge_id).first()
    target = db.query(User).filter(User.id == user_id).first()
    if not badge or not target:
        raise HTTPException(status_code=404, detail="Insignia o usuario no encontrado")
    state = db.query(UserBadgeState).filter(
        UserBadgeState.badge_id == badge.id,
        UserBadgeState.user_id == target.id,
    ).first()
    if state and state.status == "approved":
        db.delete(state)
        action = "REVOKE_BADGE"
        detail = "Insignia revocada"
    else:
        if not state:
            state = UserBadgeState(user_id=target.id, badge_id=badge.id)
            db.add(state)
        state.status = "approved"
        state.requested_at = state.requested_at or utc_now()
        state.reviewed_at = utc_now()
        state.reviewed_by_id = admin.id
        state.is_favorite = False
        action = "ASSIGN_BADGE"
        detail = "Insignia asignada"
    db.commit()
    notify(
        db,
        target.id,
        "badge_assigned" if action == "ASSIGN_BADGE" else "badge_revoked",
        "Insignia asignada" if action == "ASSIGN_BADGE" else "Insignia revocada",
        f"La insignia {badge.name} fue {'asignada a' if action == 'ASSIGN_BADGE' else 'retirada de'} tu perfil.",
        "/perfil",
    )
    log_action(db, admin, action, "Badge", badge.id, badge.name, {"user": target.username})
    return {"detail": detail}


@router.put("/admin/states/{state_id}")
def review_badge(
    state_id: UUID,
    payload: ReviewPayload,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    if payload.status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Estado de revisión no válido")
    state = (
        db.query(UserBadgeState)
        .options(joinedload(UserBadgeState.badge), joinedload(UserBadgeState.user))
        .filter(UserBadgeState.id == state_id)
        .first()
    )
    if not state or state.status != "pending":
        raise HTTPException(status_code=400, detail="La solicitud ya no está pendiente")
    state.status = payload.status
    state.reviewed_at = utc_now()
    state.reviewed_by_id = admin.id
    state.is_favorite = False
    db.commit()
    notify(
        db,
        state.user_id,
        "badge_approved" if payload.status == "approved" else "badge_rejected",
        "Solicitud de insignia aprobada" if payload.status == "approved" else "Solicitud de insignia rechazada",
        f"Tu solicitud para {state.badge.name} fue {'aprobada' if payload.status == 'approved' else 'rechazada'}.",
        "/perfil",
    )
    log_action(db, admin, "APPROVE_BADGE" if payload.status == "approved" else "REJECT_BADGE", "Badge", state.badge.id, state.badge.name, {"user": state.user.username})
    return {"detail": "Solicitud actualizada", "status": state.status}


@router.delete("/admin/states/{state_id}")
def revoke_badge(
    state_id: UUID,
    db: Session = Depends(deps.get_db),
    admin: User = Depends(deps.require_role("admin")),
):
    state = (
        db.query(UserBadgeState)
        .options(joinedload(UserBadgeState.badge), joinedload(UserBadgeState.user))
        .filter(UserBadgeState.id == state_id)
        .first()
    )
    if not state:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    badge_name = state.badge.name
    badge_id = state.badge_id
    username = state.user.username
    target_user_id = state.user_id
    db.delete(state)
    db.commit()
    notify(db, target_user_id, "badge_revoked", "Insignia revocada", f"La insignia {badge_name} fue retirada de tu perfil.", "/perfil")
    log_action(db, admin, "REVOKE_BADGE", "Badge", badge_id, badge_name, {"user": username})
    return {"detail": "Insignia revocada"}

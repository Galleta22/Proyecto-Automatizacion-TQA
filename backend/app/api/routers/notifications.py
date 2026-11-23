from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.models import Notification, User


router = APIRouter()


def _serialize(notification: Notification) -> dict:
    return {
        "id": str(notification.id),
        "type": notification.notification_type,
        "title": notification.title,
        "message": notification.message,
        "link": notification.link,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat() if notification.created_at else None,
    }


@router.get("/", response_model=dict)
def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    type_filter: str = Query("", max_length=40),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    query = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    if type_filter:
        query = query.filter(Notification.notification_type == type_filter)
    total = query.count()
    notifications = query.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    unread = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    ).count()
    return {
        "unread": unread,
        "items": [_serialize(item) for item in notifications],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max((total + page_size - 1) // page_size, 1),
    }


@router.put("/{notification_id}/read", response_model=dict)
def mark_notification_read(
    notification_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    notification.is_read = True
    db.commit()
    return {"detail": "Notificación leída"}


@router.put("/read-all", response_model=dict)
def mark_all_notifications_read(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    updated = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"detail": "Notificaciones leídas", "updated": updated}


@router.delete("/{notification_id}", response_model=dict)
def delete_notification(
    notification_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    db.delete(notification)
    db.commit()
    return {"detail": "Notificación eliminada"}


@router.delete("/", response_model=dict)
def delete_all_read_notifications(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    deleted = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read.is_(True),
    ).delete(synchronize_session=False)
    db.commit()
    return {"detail": "Notificaciones eliminadas", "deleted": deleted}

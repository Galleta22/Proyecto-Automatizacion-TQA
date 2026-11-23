from sqlalchemy.orm import Session

from app.models import Notification, User


def notify(
    db: Session,
    user_id,
    notification_type: str,
    title: str,
    message: str,
    link: str | None = None,
) -> Notification | None:
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        prefs = (user.preferences or {}).get("notification_preferences", {})
        if prefs.get(notification_type) is False:
            return None
    notification = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title[:150],
        message=message[:500],
        link=link,
    )
    db.add(notification)
    return notification


def notify_admins(
    db: Session,
    notification_type: str,
    title: str,
    message: str,
    link: str = "/admin",
) -> None:
    admin_ids = db.query(User.id).filter(User.role == "admin", User.is_active.is_(True)).all()
    for (admin_id,) in admin_ids:
        notify(db, admin_id, notification_type, title, message, link)

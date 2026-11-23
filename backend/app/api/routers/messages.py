from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.api import deps
from app.models import Message, User
from app.services.notifications import notify
from pydantic import BaseModel

router = APIRouter()


class SendMessageRequest(BaseModel):
    recipient_id: str
    content: str


@router.post("/", response_model=dict)
def send_message(
    request: SendMessageRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    try:
        recipient_uuid = UUID(request.recipient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de destinatario inválido")
    recipient = db.query(User).filter(User.id == recipient_uuid, User.is_active.is_(True)).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatario no encontrado")
    if current_user.id == recipient.id:
        raise HTTPException(status_code=400, detail="No puedes enviarte mensajes a ti mismo")
    content = request.content.strip()
    if not content or len(content) > 2000:
        raise HTTPException(status_code=400, detail="El mensaje debe tener entre 1 y 2000 caracteres")
    msg = Message(
        sender_id=current_user.id,
        recipient_id=recipient.id,
        content=content,
    )
    db.add(msg)
    db.commit()
    notify(
        db=db,
        user_id=recipient.id,
        notification_type="new_message",
        title="Nuevo mensaje",
        message=f"{current_user.username} te ha enviado un mensaje",
        link="/mensajes",
    )
    db.commit()
    db.refresh(msg)
    return {
        "id": str(msg.id),
        "content": msg.content,
        "sender_id": str(msg.sender_id),
        "recipient_id": str(msg.recipient_id),
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat(),
    }


@router.get("/conversations", response_model=dict)
def list_conversations(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    # Use window function to get the latest message per conversation pair
    ranked = db.query(
        Message.id,
        Message.sender_id,
        Message.recipient_id,
        Message.content,
        Message.is_read,
        Message.created_at,
        func.row_number().over(
            partition_by=[
                func.least(Message.sender_id, Message.recipient_id),
                func.greatest(Message.sender_id, Message.recipient_id),
            ],
            order_by=Message.created_at.desc(),
        ).label('rn'),
    ).filter(
        or_(
            Message.sender_id == current_user.id,
            Message.recipient_id == current_user.id,
        )
    ).subquery()

    latest_per_conversation = db.query(ranked).filter(
        ranked.c.rn == 1
    ).order_by(ranked.c.created_at.desc()).all()

    conversations = []
    for msg in latest_per_conversation:
        other_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        other_user = db.query(User).filter(User.id == other_id).first()
        if not other_user:
            continue
        unread = db.query(func.count(Message.id)).filter(
            Message.sender_id == other_id,
            Message.recipient_id == current_user.id,
            Message.is_read.is_(False),
        ).scalar() or 0
        conversations.append({
            "other_user": {
                "id": str(other_user.id),
                "username": other_user.username,
                "display_name": (other_user.preferences or {}).get("nickname") or other_user.username,
                "avatar_url": (other_user.preferences or {}).get("avatar_url", ""),
            },
            "last_message": {
                "id": str(msg.id),
                "content": msg.content[:100],
                "created_at": msg.created_at.isoformat(),
                "is_mine": msg.sender_id == current_user.id,
            },
            "unread_count": unread,
        })

    total = len(conversations)
    pages = max((total + page_size - 1) // page_size, 1)
    return {"items": conversations, "total": total, "page": page, "pages": pages, "page_size": page_size, "unread_total": sum(c["unread_count"] for c in conversations)}


@router.get("/{other_user_id}", response_model=dict)
def get_conversation(
    other_user_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
):
    other_user = db.query(User).filter(User.id == other_user_id, User.is_active.is_(True)).first()
    if not other_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    query = db.query(Message).filter(
        or_(
            (Message.sender_id == current_user.id) & (Message.recipient_id == other_user.id),
            (Message.sender_id == other_user.id) & (Message.recipient_id == current_user.id),
        )
    ).order_by(Message.created_at.desc())
    total = query.count()
    messages = query.offset((page - 1) * page_size).limit(page_size).all()
    messages.reverse()
    pages = max((total + page_size - 1) // page_size, 1)
    return {
        "messages": [{
            "id": str(m.id),
            "content": m.content,
            "sender_id": str(m.sender_id),
            "is_read": m.is_read,
            "is_mine": m.sender_id == current_user.id,
            "created_at": m.created_at.isoformat(),
        } for m in messages],
        "total": total,
        "page": page,
        "pages": pages,
        "page_size": page_size,
    }


@router.put("/{message_id}/read", response_model=dict)
def mark_message_read(
    message_id: UUID,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    if msg.recipient_id != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes marcar como leído mensajes que no te pertenecen")
    msg.is_read = True
    db.commit()
    return {"detail": "Mensaje marcado como leído"}

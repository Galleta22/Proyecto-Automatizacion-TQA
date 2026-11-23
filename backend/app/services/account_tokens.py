import hashlib
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utc_now
from app.models import AccountToken, User


def issue_token(db: Session, user: User, purpose: str, minutes: int) -> str:
    db.query(AccountToken).filter(
        AccountToken.user_id == user.id,
        AccountToken.purpose == purpose,
        AccountToken.used_at.is_(None),
    ).update({"used_at": utc_now()}, synchronize_session=False)
    raw_token = secrets.token_urlsafe(32)
    db.add(AccountToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        purpose=purpose,
        expires_at=utc_now() + timedelta(minutes=minutes),
    ))
    db.commit()
    return raw_token


def consume_token(db: Session, raw_token: str, purpose: str) -> AccountToken | None:
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    token = db.query(AccountToken).filter(
        AccountToken.token_hash == token_hash,
        AccountToken.purpose == purpose,
        AccountToken.used_at.is_(None),
        AccountToken.expires_at > utc_now(),
    ).first()
    if token:
        token.used_at = utc_now()
    return token


def deliver_account_link(email: str, subject: str, path: str, raw_token: str) -> bool:
    link = f"{settings.FRONTEND_URL}{path}?token={raw_token}"
    if settings.EMAIL_DELIVERY_MODE != "smtp":
        print(f"[Ludisist email local] {email}: {subject} - {link}")
        return False
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = email
    message["Subject"] = subject
    message.set_content(f"Abre este enlace para continuar:\n\n{link}\n\nSi no solicitaste esto, ignora el mensaje.")
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_USE_TLS:
                smtp.starttls()
            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException) as error:
        print(f"[Ludisist email error] {error}")
        return False


def token_response(detail: str, raw_token: str) -> dict:
    response = {"detail": detail}
    if settings.EMAIL_DELIVERY_MODE != "smtp":
        response["debug_token"] = raw_token
    return response

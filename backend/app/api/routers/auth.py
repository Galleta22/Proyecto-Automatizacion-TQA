from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from app.api import deps
from app.core import security
from app.models import User
from app.schemas.user import LoginRequest
from app.api.routers.audit import log_action
from app.services.account_tokens import consume_token, deliver_account_link, issue_token, token_response

router = APIRouter()


class EmailPayload(BaseModel):
    email: EmailStr


class TokenPayload(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class ResetPasswordPayload(TokenPayload):
    password: str = Field(min_length=8, max_length=72)

@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(deps.get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:250]
    if not user or not security.verify_password(payload.password, user.password):
        # Log failed login attempt
        log_action(db, None, "LOGIN_FAILED", "User", None, payload.username, {
            "reason": "Invalid credentials",
            "user_agent": user_agent,
        }, ip_address=client_ip)
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    if not user.is_active:
        log_action(db, user, "LOGIN_FAILED", "User", user.id, user.username, {
            "reason": "Account inactive",
            "role": user.role,
            "user_agent": user_agent,
        }, ip_address=client_ip)
        raise HTTPException(status_code=403, detail="Cuenta desactivada. Contacte al administrador.")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Debes verificar tu correo antes de iniciar sesión")

    access_token = security.create_access_token(data={
        "sub": user.username,
        "user_id": str(user.id),
        "role": user.role,
        "email": user.email
    })

    # Log successful login
    log_action(db, user, "LOGIN", "User", user.id, user.username, {
        "role": user.role,
        "user_agent": user_agent,
    }, ip_address=client_ip)

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/password/forgot", response_model=dict)
def forgot_password(payload: EmailPayload, db: Session = Depends(deps.get_db)):
    user = db.query(User).filter(User.email == payload.email, User.is_active.is_(True)).first()
    if not user:
        return {"detail": "Si el correo está registrado, recibirás instrucciones"}
    raw_token = issue_token(db, user, "password_reset", 30)
    delivered = deliver_account_link(user.email, "Recupera tu contraseña de Ludisist", "/restablecer-contrasena", raw_token)
    return token_response("Revisa tu correo para restablecer la contraseña" if delivered else "Continúa con la recuperación local", raw_token)


@router.post("/password/reset", response_model=dict)
def reset_password(payload: ResetPasswordPayload, db: Session = Depends(deps.get_db)):
    account_token = consume_token(db, payload.token, "password_reset")
    if not account_token:
        raise HTTPException(status_code=400, detail="El enlace es inválido o ha vencido")
    account_token.user.password = security.get_password_hash(payload.password)
    db.commit()
    return {"detail": "Contraseña actualizada"}


@router.post("/email/verify", response_model=dict)
def verify_email(payload: TokenPayload, db: Session = Depends(deps.get_db)):
    account_token = consume_token(db, payload.token, "verify_email")
    if not account_token:
        raise HTTPException(status_code=400, detail="El enlace es inválido o ha vencido")
    account_token.user.email_verified = True
    db.commit()
    return {"detail": "Correo verificado"}


@router.post("/email/resend", response_model=dict)
def resend_verification(payload: EmailPayload, db: Session = Depends(deps.get_db)):
    user = db.query(User).filter(User.email == payload.email, User.is_active.is_(True)).first()
    if not user or user.email_verified:
        return {"detail": "Si la cuenta requiere verificación, recibirás instrucciones"}
    raw_token = issue_token(db, user, "verify_email", 1440)
    delivered = deliver_account_link(user.email, "Verifica tu correo en Ludisist", "/verificar-correo", raw_token)
    return token_response("Revisa tu correo" if delivered else "Continúa con la verificación local", raw_token)


@router.post("/refresh")
def refresh_session(
    request: Request,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")

    access_token = security.create_access_token(data={
        "sub": user.username,
        "user_id": str(user.id),
        "role": user.role,
        "email": user.email,
    })
    log_action(db, user, "REFRESH_SESSION", "User", user.id, user.username, {
        "role": user.role,
        "user_agent": request.headers.get("user-agent", "")[:250],
    }, ip_address=request.client.host if request.client else None)
    return {"access_token": access_token, "token_type": "bearer"}



@router.post("/account/request-reactivation")
def request_reactivation(payload: LoginRequest, db: Session = Depends(deps.get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not security.verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    prefs = dict(user.preferences or {})
    if prefs.get("account_deleted"):
        raise HTTPException(status_code=409, detail="Esta cuenta fue eliminada y no puede reactivarse")
    if user.is_active:
        return {"detail": "La cuenta está activa. Puedes iniciar sesión"}
    if not prefs.get("reactivation_requested"):
        from app.services.notifications import notify_admins
        prefs["reactivation_requested"] = True
        user.preferences = prefs
        notify_admins(db, "account_reactivation", "Solicitud de reactivación", f"{user.username} solicita recuperar el acceso a su cuenta", "/admin?modulo=users")
        db.commit()
        log_action(db, user, "REQUEST_REACTIVATION", "User", str(user.id), user.username)
    return {"detail": "Solicitud registrada. Un administrador debe revisar y reactivar la cuenta"}

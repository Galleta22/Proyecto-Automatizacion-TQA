from typing import Generator, Optional
from uuid import UUID
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.database.base import SessionLocal
from app.models import User
from app.core.config import settings

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(get_db)) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        user_id = payload.get("user_id")
        if username is None or user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
        user = db.query(User).filter_by(id=UUID(str(user_id)), username=username).first()
        if user is None:
            raise HTTPException(status_code=401, detail="Usuario inválido")
        return user
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales de autenticación no válidas",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        username = payload.get("sub")
        user_id = payload.get("user_id")
        if not username or not user_id:
            return None
        return db.query(User).filter_by(id=UUID(str(user_id)), username=username).first()
    except (JWTError, ValueError, TypeError):
        return None

def require_role(*roles):
    def role_checker(user: User = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Permiso denegado")
        return user
    return role_checker

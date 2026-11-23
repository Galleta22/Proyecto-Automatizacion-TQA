from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional, Literal

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Optional[str] = "player"
    experience_level: Literal["beginner", "intermediate", "advanced", "expert"] = "beginner"

    @field_validator("password")
    @classmethod
    def password_size(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Contraseña demasiado larga")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()

    @field_validator("username")
    @classmethod
    def clean_username(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Usuario muy corto.")
        return value

class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=72)
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserDeactivateRequest(BaseModel):
    password: str

class UserProfileUpdate(BaseModel):
    avatar_url: Optional[str] = None
    nickname: Optional[str] = None
    bio: Optional[str] = None
    experience_level: Optional[str] = None
    favorite_genres: Optional[List[str]] = None
    play_style: Optional[str] = None
    preferred_duration: Optional[str] = None
    preferred_group_size: Optional[str] = None
    looking_for_players: Optional[bool] = None
    open_to_events: Optional[bool] = None
    open_to_messages: Optional[bool] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class NotificationPreferences(BaseModel):
    manual_report: bool = True
    manual_report_resolved: bool = True
    new_message: bool = True
    table_join_request: bool = True
    table_request_approved: bool = True
    table_request_rejected: bool = True
    table_cancelled: bool = True
    table_finished: bool = True
    badge_assigned: bool = True
    badge_approved: bool = True
    badge_rejected: bool = True
    badge_revoked: bool = True

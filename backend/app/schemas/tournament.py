from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ==================== TOURNAMENT ====================

class TournamentCreate(BaseModel):
    name: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=2000)
    game_id: UUID
    is_public: bool = False
    location: str = Field(default="", max_length=180)
    scheduled_at: Optional[datetime] = None
    max_participants: int = Field(default=16, ge=4, le=128)
    elimination: bool = False
    advance_per_table: int = Field(default=2, ge=1, le=9)
    competition_format: Literal["individual", "multiplayer", "teams"] = "individual"
    table_size: int = Field(default=4, ge=3, le=10)
    team_size: int = Field(default=2, ge=2, le=8)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Nombre del torneo muy corto.")
        return value


class TournamentUpdate(BaseModel):
    elimination: Optional[bool] = None
    table_size: Optional[int] = Field(default=None, ge=3, le=10)
    advance_per_table: Optional[int] = Field(default=None, ge=1, le=9)
    is_public: Optional[bool] = None
    location: Optional[str] = Field(default=None, max_length=180)
    scheduled_at: Optional[datetime] = None
    name: Optional[str] = Field(default=None, min_length=3, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    max_participants: Optional[int] = Field(default=None, ge=4, le=128)


# ==================== PARTICIPANTS ====================

class ParticipantAdd(BaseModel):
    user_id: Optional[UUID] = None
    external_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    team_members: list[str] = Field(default_factory=list, max_length=8)
    skill_level: Literal["principiante", "intermedio", "avanzado", "experto"] = "intermedio"

    @field_validator("external_name")
    @classmethod
    def clean_external(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            value = value.strip()
            if len(value) < 2:
                raise ValueError("Nombre externo muy corto.")
        return value

    def model_post_init(self, __context):
        if not self.user_id and not self.external_name:
            raise ValueError("Debes indicar un usuario del sistema o un nombre externo.")


# ==================== JUDGES ====================

class JudgeAdd(BaseModel):
    user_id: UUID
    is_head_judge: bool = False


# ==================== MATCH RESULT ====================

class MatchResult(BaseModel):
    placements: Optional[list[UUID]] = Field(default=None, min_length=2, max_length=10)
    winner_id: Optional[UUID] = None  # None = empate
    score_p1: float = Field(default=0, ge=0, le=9999)
    score_p2: float = Field(default=0, ge=0, le=9999)
    notes: str = Field(default="", max_length=500)


class TournamentEnrollment(BaseModel):
    skill_level: Literal["principiante", "intermedio", "avanzado", "experto"] = "principiante"

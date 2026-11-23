from typing import List, Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


def validate_team_setup(scoring_mode, teams, players):
    if scoring_mode != "teams":
        return
    if len(teams) < 2:
        raise ValueError("Agrega al menos dos equipos.")
    team_ids = [team.id for team in teams]
    if len(team_ids) != len(set(team_ids)):
        raise ValueError("Los equipos están duplicados.")
    if any(not player.team_id or player.team_id not in team_ids for player in players):
        raise ValueError("Asigna cada jugador a un equipo.")


class SessionPlayer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: Optional[UUID] = None
    name: str = Field(min_length=1, max_length=50)
    score: float = 0
    color: str = Field(default="#3c8dbc", max_length=20)
    team_id: Optional[str] = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Escribe el nombre del jugador.")
        return value


class SessionTeam(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()), max_length=100)
    name: str = Field(min_length=1, max_length=40)
    score: float = 0
    color: str = Field(default="#3c8dbc", max_length=20)

    @field_validator("name")
    @classmethod
    def clean_team_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Nombre de equipo muy corto.")
        return value


class SessionCounter(BaseModel):
    id: str = Field(max_length=100)
    name: str = Field(min_length=1, max_length=40)
    value: float = 0
    step: float = Field(default=1, gt=0, le=1000000)
    color: str = Field(default="#3c8dbc", max_length=20)

    @field_validator("name")
    @classmethod
    def clean_counter_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Nombre vacío.")
        return value


class DiceRoll(BaseModel):
    id: str = Field(max_length=100)
    sides: int = Field(ge=2, le=1000)
    result: int = Field(ge=1, le=1000)
    timestamp: str = Field(max_length=50)


class SessionCreate(BaseModel):
    game_id: UUID
    players: List[SessionPlayer] = Field(min_length=1, max_length=20)
    notes: str = Field(default="", max_length=5000)
    snapshots: List[str] = Field(default_factory=list, max_length=12)
    turn_order: List[str] = Field(default_factory=list, max_length=20)
    turn_order_enabled: bool = False
    round_number: int = Field(default=1, ge=1, le=9999)
    active_player_id: Optional[str] = Field(default=None, max_length=100)
    elapsed_seconds: int = Field(default=0, ge=0)
    turn_times: dict[str, int] = Field(default_factory=dict)
    score_history: List[dict] = Field(default_factory=list, max_length=100)
    custom_counters: List[SessionCounter] = Field(default_factory=list, max_length=20)
    dice_history: List[DiceRoll] = Field(default_factory=list, max_length=50)
    visibility: Literal["public", "private"] = "private"
    scoring_mode: Literal["individual", "teams"] = "individual"
    teams: List[SessionTeam] = Field(default_factory=list, max_length=10)

    @field_validator("turn_times")
    @classmethod
    def valid_turn_times(cls, value: dict[str, int]):
        if len(value) > 20 or any(len(player_id) > 100 or seconds < 0 for player_id, seconds in value.items()):
            raise ValueError("Tiempos por turno no válidos")
        return value

    @model_validator(mode="after")
    def valid_teams(self):
        validate_team_setup(self.scoring_mode, self.teams, self.players)
        return self


class SessionUpdate(BaseModel):
    players: Optional[List[SessionPlayer]] = Field(default=None, min_length=1, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=5000)
    visibility: Optional[Literal["public", "private"]] = None
    snapshots: Optional[List[str]] = Field(default=None, max_length=12)
    turn_order: Optional[List[str]] = Field(default=None, max_length=20)
    turn_order_enabled: Optional[bool] = None
    round_number: Optional[int] = Field(default=None, ge=1, le=9999)
    active_player_id: Optional[str] = Field(default=None, max_length=100)
    elapsed_seconds: Optional[int] = Field(default=None, ge=0)
    turn_times: Optional[dict[str, int]] = None
    score_history: Optional[List[dict]] = Field(default=None, max_length=100)
    custom_counters: Optional[List[SessionCounter]] = Field(default=None, max_length=20)
    dice_history: Optional[List[DiceRoll]] = Field(default=None, max_length=50)
    scoring_mode: Optional[Literal["individual", "teams"]] = None
    teams: Optional[List[SessionTeam]] = Field(default=None, max_length=10)

    @field_validator("turn_times")
    @classmethod
    def valid_turn_times(cls, value: Optional[dict[str, int]]):
        if value is not None and (
            len(value) > 20 or any(len(player_id) > 100 or seconds < 0 for player_id, seconds in value.items())
        ):
            raise ValueError("Tiempos por turno no válidos")
        return value

    @model_validator(mode="after")
    def valid_teams(self):
        if self.scoring_mode == "teams" and self.teams is not None and self.players is not None:
            validate_team_setup(self.scoring_mode, self.teams, self.players)
        return self

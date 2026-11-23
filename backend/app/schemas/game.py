from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional

class GameBase(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: Optional[str] = ""
    min_players: int = Field(default=1, ge=1, le=100)
    max_players: int = Field(default=10, ge=1, le=100)
    playing_time: int = Field(default=1, ge=1, le=10000)
    complexity_rating: float = Field(default=1.0, ge=1, le=5)
    image_url: Optional[str] = None
    game_metadata: Optional[dict] = {}

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Nombre muy corto.")
        return value

    @model_validator(mode="after")
    def valid_player_range(self):
        if self.max_players < self.min_players:
            raise ValueError("Máximo menor al mínimo.")
        return self

class GameCreate(GameBase):
    slug: Optional[str] = None

class GameUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str]
    min_players: Optional[int] = Field(default=None, ge=1, le=100)
    max_players: Optional[int] = Field(default=None, ge=1, le=100)
    playing_time: Optional[int] = Field(default=None, ge=1, le=10000)
    complexity_rating: Optional[float] = Field(default=None, ge=1, le=5)
    image_url: Optional[str] = None
    bgg_id: Optional[int] = None
    game_metadata: Optional[dict] = {}

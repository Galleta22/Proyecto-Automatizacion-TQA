from pydantic import BaseModel, Field, field_validator
from typing import Optional

class RuleBase(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    content: str = Field(min_length=10)
    rule_type: str = "gameplay"
    game_id: str  # UUID as string
    is_official: bool = True
    source: str = "bgg"
    visibility: str = "global"

    @field_validator("title", "content")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Campo vacío.")
        return value

class RuleCreate(RuleBase):
    pass

class RuleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=255)
    content: Optional[str] = Field(default=None, min_length=10)
    rule_type: Optional[str] = None
    is_official: Optional[bool] = None
    source: Optional[str] = None
    visibility: Optional[str] = None

    @field_validator("title", "content")
    @classmethod
    def clean_optional_text(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Campo vacío.")
        return value

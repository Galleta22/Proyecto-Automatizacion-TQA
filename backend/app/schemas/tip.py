from typing import Optional

from pydantic import BaseModel, Field, field_validator


VALID_CATEGORIES = {
    "getting_started",
    "important_rule",
    "confusing_rule",
    "strategy",
    "general",
}


class TipCreate(BaseModel):
    category: str = "general"
    content: str = Field(min_length=10, max_length=800)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        if value not in VALID_CATEGORIES:
            raise ValueError("Categoría de tip no válida")
        return value

    @field_validator("content")
    @classmethod
    def clean_content(cls, value: str) -> str:
        return value.strip()


class TipUpdate(BaseModel):
    category: Optional[str] = None
    content: Optional[str] = Field(default=None, min_length=10, max_length=800)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_CATEGORIES:
            raise ValueError("Categoría de tip no válida")
        return value

    @field_validator("content")
    @classmethod
    def clean_content(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value

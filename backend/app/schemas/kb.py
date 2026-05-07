"""Pydantic DTOs for knowledge-base endpoints."""
from datetime import datetime
from pydantic import BaseModel, Field


class KBCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    category: str = Field("general", min_length=1, max_length=100)
    body: str = Field(..., min_length=1)
    tags: list[str] = Field(default_factory=list)


class KBUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    category: str | None = Field(None, min_length=1, max_length=100)
    body: str | None = Field(None, min_length=1)
    tags: list[str] | None = None


class KBResponse(BaseModel):
    id: int
    owner_user_id: int | None
    title: str
    category: str
    body: str
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class KBListResponse(BaseModel):
    items: list[KBResponse]
    total: int

"""Pydantic DTOs for template endpoints."""
from datetime import datetime
from pydantic import BaseModel, Field


class TemplateSection(BaseModel):
    heading: str = Field(..., min_length=1, max_length=200)
    instructions: str = Field("", max_length=2000)
    default_content: str = Field("", max_length=20000)


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    sections: list[TemplateSection] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    sections: list[TemplateSection] | None = None


class TemplateResponse(BaseModel):
    id: int
    owner_user_id: int | None
    name: str
    description: str
    sections: list[TemplateSection]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateListResponse(BaseModel):
    items: list[TemplateResponse]
    total: int

"""Pydantic DTOs for review-framework endpoints."""
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class FrameworkCriterion(BaseModel):
    name_en: str = Field("", max_length=200)
    name_ar: str = Field("", max_length=200)
    description_en: str = Field("", max_length=2000)
    description_ar: str = Field("", max_length=2000)
    prompt_instruction_en: str = Field("", max_length=5000)
    prompt_instruction_ar: str = Field("", max_length=5000)
    group: str = Field("", max_length=200)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_fields(cls, data):
        """Map old single-language fields to _en variants for backward compat."""
        if isinstance(data, dict):
            if "name" in data and "name_en" not in data:
                data["name_en"] = data.pop("name", "")
            if "description" in data and "description_en" not in data:
                data["description_en"] = data.pop("description", "")
            if "prompt_instruction" in data and "prompt_instruction_en" not in data:
                data["prompt_instruction_en"] = data.pop("prompt_instruction", "")
        return data

    @model_validator(mode="after")
    def require_at_least_one_name(self):
        if not (self.name_en.strip() or self.name_ar.strip()):
            raise ValueError("At least one of name_en or name_ar must be provided.")
        return self


class FrameworkCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    persona_instruction: str = Field("", max_length=5000)
    persona_instruction_ar: str = Field("", max_length=5000)
    model: str = Field("gemma4:latest", min_length=1, max_length=100)
    is_public: bool = False
    criteria: list[FrameworkCriterion] = Field(default_factory=list)


class FrameworkUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    persona_instruction: str | None = Field(None, max_length=5000)
    persona_instruction_ar: str | None = Field(None, max_length=5000)
    model: str | None = Field(None, min_length=1, max_length=100)
    is_public: bool | None = None
    criteria: list[FrameworkCriterion] | None = None


class FrameworkResponse(BaseModel):
    id: int
    owner_user_id: int | None
    name: str
    persona_instruction: str
    persona_instruction_ar: str
    model: str
    is_public: bool
    criteria: list[FrameworkCriterion]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FrameworkSummary(BaseModel):
    """Lightweight shape for the sidebar list — omits the heavy fields."""
    id: int
    owner_user_id: int | None
    name: str
    is_public: bool
    criteria_count: int
    updated_at: datetime


class FrameworkListResponse(BaseModel):
    items: list[FrameworkSummary]
    total: int


class AutoGenFromFileResponse(BaseModel):
    """Output of the AI-driven 'generate criteria from a sample file' helper."""
    criteria: list[FrameworkCriterion]

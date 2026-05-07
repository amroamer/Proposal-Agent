"""Pydantic DTOs for per-user LLM preferences."""
from datetime import datetime
from pydantic import BaseModel, Field


class LLMOptions(BaseModel):
    """All standard Ollama sampling/generation options.

    Every field is optional. Missing fields fall back to Ollama defaults
    (NOT to client-side defaults), so the user can leave a slider untouched
    and get whatever the model ships with.
    """
    temperature:    float | None = Field(None, ge=0, le=2)
    top_p:          float | None = Field(None, ge=0, le=1)
    top_k:          int   | None = Field(None, ge=0, le=10000)
    num_ctx:        int   | None = Field(None, ge=128, le=131072)
    num_predict:    int   | None = Field(None, ge=-1, le=131072)
    repeat_penalty: float | None = Field(None, ge=0, le=5)
    seed:           int   | None = None
    mirostat:       int   | None = Field(None, ge=0, le=2)
    mirostat_eta:   float | None = Field(None, ge=0, le=1)
    mirostat_tau:   float | None = Field(None, ge=0, le=20)
    stop:           list[str] | None = None


class LLMPreferenceUpdate(BaseModel):
    model: str | None = Field(None, max_length=100)  # null/empty -> use system default
    options: LLMOptions = Field(default_factory=LLMOptions)


class LLMPreferenceResponse(BaseModel):
    user_id: int
    model: str | None
    options: LLMOptions
    updated_at: datetime

    class Config:
        from_attributes = True


class LLMTestRequest(BaseModel):
    model: str | None = None
    options: LLMOptions = Field(default_factory=LLMOptions)
    prompt: str = Field(
        "In one sentence, introduce yourself.",
        min_length=1, max_length=2000,
    )


class LLMTestResponse(BaseModel):
    output: str
    model: str
    duration_ms: int

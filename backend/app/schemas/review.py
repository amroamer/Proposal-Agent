"""Pydantic DTOs for proposal review endpoints."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

DocumentClass = Literal["proposal", "deliverable", "presentation"]


class ReviewMetadata(BaseModel):
    """AI-extracted (and user-editable) document metadata."""
    document_title: str = ""
    client_name: str = ""
    submission_date: str = ""  # free-form ISO-like string; we don't validate strictly
    purpose_and_scope: str = ""
    client_mandatory_requirements: str = ""


class ReviewSummary(BaseModel):
    """List-row shape — omits the heavy text fields."""
    id: int
    source_filename: str
    source_kind: str
    source_size_bytes: int
    model: str
    duration_ms: int
    prompt_preview: str = Field(..., description="First ~200 chars of the prompt label")
    document_class: DocumentClass = "proposal"
    framework_ids: list[int] = Field(default_factory=list)
    extracted_metadata: ReviewMetadata = Field(default_factory=ReviewMetadata)
    aggregate_score: float | None = Field(
        default=None,
        description="Average of per-criterion scores parsed from the review_output, on a 0-10 scale. "
                    "None if no scores could be parsed (e.g. legacy free-form reviews).",
    )
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewDetail(BaseModel):
    """Full review including extracted text and LLM output."""
    id: int
    created_by: int
    source_filename: str
    source_kind: str
    source_size_bytes: int
    extracted_text: str
    prompt: str
    review_output: str
    model: str
    duration_ms: int
    document_class: DocumentClass = "proposal"
    framework_ids: list[int] = Field(default_factory=list)
    disabled_criteria: list[str] = Field(default_factory=list)
    extracted_metadata: ReviewMetadata = Field(default_factory=ReviewMetadata)
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewListResponse(BaseModel):
    items: list[ReviewSummary]
    total: int


class MetadataExtractResponse(BaseModel):
    metadata: ReviewMetadata


class OllamaModel(BaseModel):
    name: str
    parameter_size: str | None = None
    family: str | None = None
    size_bytes: int | None = None


class OllamaModelsResponse(BaseModel):
    models: list[OllamaModel]

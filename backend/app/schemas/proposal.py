"""Pydantic DTOs for proposal endpoints."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

ProposalStatus = Literal["draft", "in_review", "approved", "submitted", "archived"]


class ProposalSection(BaseModel):
    heading: str = Field(..., min_length=1, max_length=200)
    content: str = Field("", max_length=50000)


class ProposalCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    client_name: str = Field("", max_length=200)
    template_id: int | None = None
    status: ProposalStatus = "draft"
    sections: list[ProposalSection] = Field(default_factory=list)
    notes: str = Field("", max_length=20000)


class ProposalUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=300)
    client_name: str | None = Field(None, max_length=200)
    template_id: int | None = None
    status: ProposalStatus | None = None
    sections: list[ProposalSection] | None = None
    notes: str | None = Field(None, max_length=20000)


class ProposalResponse(BaseModel):
    id: int
    owner_user_id: int | None
    template_id: int | None
    title: str
    client_name: str
    status: ProposalStatus
    sections: list[ProposalSection]
    notes: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProposalListResponse(BaseModel):
    items: list[ProposalResponse]
    total: int

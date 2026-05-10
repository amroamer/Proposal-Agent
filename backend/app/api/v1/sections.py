"""Phase 5 — canonical section list endpoint.

Returns the 13 canonical KPMG-template section keys with EN + AR labels.
The frontend's `<EvidenceSourceSelect />` calls this on mount to
populate the multi-select chip picker.

Single source of truth: `app.services.proposal_review.section_mapping`.
Adding a new canonical section means updating that module — this
endpoint surfaces whatever is registered there, no second mapping to
maintain.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.proposal_review.section_mapping import (
    SECTION_KEYS,
    SECTION_LABELS,
)
from app.services.proposal_review.group_routing import WILDCARD

router = APIRouter(tags=["proposal-review-meta"])


class SectionEntry(BaseModel):
    key: str
    label_en: str
    label_ar: str


class SectionsResponse(BaseModel):
    """Response shape:
      sections: ordered list of canonical sections
      wildcard: the special key ('*') the UI binds the
                'Whole proposal' toggle to
    """
    sections: list[SectionEntry]
    wildcard: str


@router.get("/sections", response_model=SectionsResponse)
async def list_sections():
    items: list[SectionEntry] = []
    for key in SECTION_KEYS:
        labels = SECTION_LABELS.get(key, {"en": key, "ar": ""})
        items.append(
            SectionEntry(key=key, label_en=labels["en"], label_ar=labels["ar"])
        )
    return SectionsResponse(sections=items, wildcard=WILDCARD)

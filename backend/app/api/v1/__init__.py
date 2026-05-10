"""API v1 router aggregation."""
from fastapi import APIRouter

from app.api.v1 import (
    auth,
    frameworks,
    kb,
    llm,
    proposal_reviews,
    proposals,
    reviews,
    sections,
    templates,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(kb.router)
api_router.include_router(templates.router)
api_router.include_router(proposals.router)
api_router.include_router(frameworks.router)
api_router.include_router(reviews.router)
api_router.include_router(llm.router)
# Phase-4 framework-driven per-criterion reviews. Distinct from the
# legacy `reviews.router` which handles the single-blob Markdown flow.
api_router.include_router(proposal_reviews.router)
# Phase-5 canonical section list (UI populates the evidence_source picker).
api_router.include_router(sections.router)

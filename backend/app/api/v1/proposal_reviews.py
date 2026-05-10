"""Phase 4 — proposal-criterion review endpoints.

Two endpoints, mounted under `/ProposalAgent/api/v1/proposals/{id}`:

  POST /reviews   — kick off a Celery run_review task; returns task_id.
  GET  /reviews/latest — read the latest persisted criterion-review rows.

Distinct from the legacy `/reviews` router (`reviews.py`) which serves
the single-blob Markdown review feature. We keep both — Phase 4
introduces a new persistence shape (per-criterion rows) without
breaking the existing free-form review flow.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbSession
from app.services.proposal_review.criterion_runner import latest_review_rows

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/proposals", tags=["proposal-reviews"])


# ---------- request / response schemas ---------------------------------------


class TriggerReviewRequest(BaseModel):
    framework_id: int
    review_model: str | None = None
    extraction_model: str | None = None


class TriggerReviewResponse(BaseModel):
    task_id: str
    proposal_id: int
    framework_id: int


class CriterionReviewResponse(BaseModel):
    id: int
    proposal_id: int
    framework_id: int
    criterion_id: str
    score: int
    score_label: str
    evidence: str
    gaps: list[str]
    slides_referenced: list[int]
    language_used: str
    created_at: str

    @classmethod
    def from_row(cls, row) -> "CriterionReviewResponse":
        return cls(
            id=row.id,
            proposal_id=row.proposal_id,
            framework_id=row.framework_id,
            criterion_id=row.criterion_id,
            score=row.score,
            score_label=row.score_label,
            evidence=row.evidence,
            gaps=list(row.gaps or []),
            slides_referenced=list(row.slides_referenced or []),
            language_used=row.language_used,
            created_at=row.created_at.isoformat() if row.created_at else "",
        )


class LatestReviewResponse(BaseModel):
    proposal_id: int
    framework_id: int | None
    items: list[CriterionReviewResponse]


# ---------- endpoints --------------------------------------------------------


@router.post(
    "/{proposal_id}/reviews",
    response_model=TriggerReviewResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_review(
    proposal_id: int,
    req: TriggerReviewRequest,
    db: DbSession,
    user: CurrentUser,
):
    """Dispatch the Celery run_review task for `proposal_id`+`framework_id`.

    Returns the Celery task id. Caller can poll via Celery's standard
    AsyncResult or wait for the persisted rows to appear via
    GET .../reviews/latest.
    """
    # Imported lazily so test environments that don't have a broker
    # configured (e.g. unit tests of the API surface) still load.
    from app.tasks.run_review import run_review as run_review_task

    try:
        async_result = run_review_task.apply_async(
            kwargs={
                "proposal_id": proposal_id,
                "framework_id": req.framework_id,
                "review_model": req.review_model,
                "extraction_model": req.extraction_model,
            }
        )
    except Exception as e:  # noqa: BLE001 — broker may be down
        logger.exception("trigger_review: dispatch failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Review dispatch failed: {e}",
        ) from e

    return TriggerReviewResponse(
        task_id=async_result.id,
        proposal_id=proposal_id,
        framework_id=req.framework_id,
    )


@router.get(
    "/{proposal_id}/reviews/latest",
    response_model=LatestReviewResponse,
)
async def get_latest_review(
    proposal_id: int,
    db: DbSession,
    user: CurrentUser,
    framework_id: int | None = None,
):
    """Return the most-recent criterion-review rows for `proposal_id`,
    optionally filtered by framework.

    Rows are returned newest-first. The frontend slices by framework_id
    to render one framework's results at a time.
    """
    rows = await latest_review_rows(
        db, proposal_id=proposal_id, framework_id=framework_id
    )
    return LatestReviewResponse(
        proposal_id=proposal_id,
        framework_id=framework_id,
        items=[CriterionReviewResponse.from_row(r) for r in rows],
    )

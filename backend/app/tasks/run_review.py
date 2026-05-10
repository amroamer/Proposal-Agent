"""Celery task: run a per-criterion proposal review.

Wraps `app.services.proposal_review.criterion_runner.run_review` so the
FastAPI endpoint can return immediately with a task_id.
"""
from __future__ import annotations

import asyncio
import base64
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.proposal import Proposal
from app.models.review_framework import ReviewFramework
from app.services.proposal_review.criterion_runner import run_review as _run_review_async
from app.services.proposal_review.llm_client import Classification
from app.worker.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="proposal_review.run_review", acks_late=True, bind=True)
def run_review(
    self,
    *,
    proposal_id: int,
    framework_id: int,
    file_bytes_b64: str | None = None,
    review_model: str | None = None,
    extraction_model: str | None = None,
) -> dict:
    """Sync Celery entry point for the framework runner."""
    return asyncio.run(
        _run(
            proposal_id=proposal_id,
            framework_id=framework_id,
            file_bytes_b64=file_bytes_b64,
            review_model=review_model,
            extraction_model=extraction_model,
        )
    )


async def _run(
    *,
    proposal_id: int,
    framework_id: int,
    file_bytes_b64: str | None,
    review_model: str | None,
    extraction_model: str | None,
) -> dict:
    file_bytes = base64.b64decode(file_bytes_b64) if file_bytes_b64 else None

    async with AsyncSessionLocal() as session:
        proposal_q = await session.execute(
            select(Proposal).where(Proposal.id == proposal_id)
        )
        proposal = proposal_q.scalar_one_or_none()
        if proposal is None:
            raise ValueError(f"Proposal {proposal_id} not found")

        framework_q = await session.execute(
            select(ReviewFramework).where(ReviewFramework.id == framework_id)
        )
        framework = framework_q.scalar_one_or_none()
        if framework is None:
            raise ValueError(f"ReviewFramework {framework_id} not found")

        rows = await _run_review_async(
            session,
            proposal_id=proposal_id,
            framework=framework,
            classification=Classification.coerce(proposal.classification),
            file_bytes=file_bytes,
            review_model=review_model,
            extraction_model=extraction_model,
        )
        await session.commit()
        return {
            "proposal_id": proposal_id,
            "framework_id": framework_id,
            "rows_persisted": len(rows),
            "row_ids": [r.id for r in rows if r.id is not None],
        }

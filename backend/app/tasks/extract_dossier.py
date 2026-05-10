"""Celery task: full dossier extraction for one proposal.

Wraps the async `extract_dossier` orchestration. The async function
already does cache-check, splitter run, parallel per-section extraction
(via asyncio.gather), and dossier persistence — Celery distribution is
mostly about getting the long-running work off the FastAPI request loop.

For multi-worker setups where you want to fan out section extraction
to multiple worker boxes via Celery group(), call
`app.tasks.extract_section.extract_section.s(...)` directly. Inside one
worker box, the asyncio.gather() inside `extract_dossier` already gives
you HTTP-level concurrency, which is what matters for the Ollama call
mix.
"""
from __future__ import annotations

import asyncio
import logging

from app.database import AsyncSessionLocal
from app.models.proposal_review import ProposalReview
from app.services.proposal_review.extractor import extract_dossier as _extract_dossier_async
from app.services.proposal_review.llm_client import Classification
from app.worker.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="proposal_review.extract_dossier", acks_late=True, bind=True)
def extract_dossier(
    self,
    *,
    proposal_id: int,
    review_id: int | None = None,
    file_bytes_b64: str | None = None,
    persona: str | None = None,
    model: str | None = None,
    classification: str | None = None,
) -> dict:
    """Run dossier extraction for a proposal.

    Either `review_id` (load source_bytes from proposal_reviews) or
    `file_bytes_b64` (caller-provided base64 of the .pptx) must be set.
    The reason for the split: the upload endpoint already persists raw
    bytes on the legacy review row, so we don't ship them through the
    broker for the common case.
    """
    return asyncio.run(
        _run(
            proposal_id=proposal_id,
            review_id=review_id,
            file_bytes_b64=file_bytes_b64,
            persona=persona,
            model=model,
            classification=classification,
        )
    )


async def _run(
    *,
    proposal_id: int,
    review_id: int | None,
    file_bytes_b64: str | None,
    persona: str | None,
    model: str | None,
    classification: str | None,
) -> dict:
    import base64
    from sqlalchemy import select

    file_bytes: bytes | None = None
    if file_bytes_b64:
        file_bytes = base64.b64decode(file_bytes_b64)
    elif review_id is not None:
        async with AsyncSessionLocal() as session:
            row = await session.get(ProposalReview, review_id)
            if row is None:
                raise ValueError(f"ProposalReview {review_id} not found")
            # source_bytes is deferred — explicit refresh is required.
            await session.refresh(row, attribute_names=["source_bytes"])
            file_bytes = bytes(row.source_bytes or b"")
    if not file_bytes:
        raise ValueError("extract_dossier requires file_bytes_b64 or review_id with source_bytes")

    cls = Classification.coerce(classification) if classification else None

    async with AsyncSessionLocal() as session:
        row = await _extract_dossier_async(
            session,
            proposal_id=proposal_id,
            file_bytes=file_bytes,
            persona=persona,
            model=model,
            classification=cls,
        )
        await session.commit()
        return {
            "dossier_id": row.id,
            "source_hash": row.source_hash,
            "model": row.model,
            "section_count": len(row.dossier_json.get("sections") or {}),
        }

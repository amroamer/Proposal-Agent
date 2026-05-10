"""Celery sub-task: extract one section's facts from the section text.

Spec asks for parallel dispatch of per-section extractions via Celery
`group()`. This task is the group member: it takes the section payload
already produced by the splitter and returns a SectionExtraction-shaped
dict that the parent dossier task aggregates.

Note: `app.services.proposal_review.extractor.extract_one_section` does
the actual work as an async function. This file is the thin sync shim
that bridges Celery's sync task body into the async client.
"""
from __future__ import annotations

import asyncio
import logging

from app.services.proposal_review.extractor import extract_one_section
from app.services.proposal_review.llm_client import Classification, Provider
from app.services.proposal_review.section_splitter import SectionContent
from app.worker.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="proposal_review.extract_section", acks_late=True)
def extract_section(
    *,
    section: dict,
    classification: str,
    persona: str | None,
    model: str | None,
    provider: str = Provider.LOCAL_OLLAMA.value,
) -> dict:
    """Sync Celery entry point. Inputs / outputs are JSON-friendly dicts."""
    section_obj = SectionContent.model_validate(section)
    cls = Classification.coerce(classification)
    prov = Provider(provider)

    result = asyncio.run(
        extract_one_section(
            section_obj,
            classification=cls,
            persona=persona,
            model=model,
            provider=prov,
        )
    )
    logger.info(
        "celery extract_section section=%s duration_ms=%d",
        result.section_key, result.duration_ms,
    )
    return {
        "section_key": result.section_key,
        "payload": result.payload,
        "duration_ms": result.duration_ms,
        "model": result.model,
    }

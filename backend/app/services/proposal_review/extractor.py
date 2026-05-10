"""Phase 3 — extractor pipeline.

Pure async orchestration of:
  1. Compute sha256 of the .pptx
  2. Cache lookup on (proposal_id, source_hash, model). Hit -> return.
  3. Run Phase-1 splitter on the bytes.
  4. For each populated canonical section with a registered schema,
     extract structured facts via the LLM. Calls run concurrently via
     `asyncio.gather` — the Celery layer dispatches the same logic via
     `group()` for distributed-worker setups.
  5. Validate each per-section response with its Pydantic schema.
     Retry once on validation failure; on the second failure, log and
     store {} for that section so the dossier still persists.
  6. Assemble + persist a `Dossier` row. Idempotent on the cache key.

NO LLM calls happen during the splitter step (Phase 1 is deterministic).
NO regex-parsing of model output anywhere — every section extraction
returns through Pydantic schema validation.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dossier import Dossier as DossierRow
from app.models.proposal import Proposal

from .dossier_schemas import (
    SECTION_SCHEMAS,
    Dossier as DossierModel,
    schema_for,
    validate_section_payload,
)
from .llm_client import (
    Classification,
    Provider,
    StructuredResult,
    _resolve_default_model,
    generate_structured,
)
from .section_mapping import SECTION_KEYS, FRONT_MATTER_KEY
from .section_splitter import ProposalSections, SectionContent, split_pptx

logger = logging.getLogger(__name__)


# ---------- prompt construction ---------------------------------------------


_DEFAULT_PERSONA = (
    "You are a senior KPMG Saudi Arabia Advisory analyst extracting "
    "structured facts from one section of a consulting proposal. "
    "Return ONLY a JSON object that matches the schema. "
    "Do not translate the source content — preserve Arabic and English "
    "verbatim from the proposal. If a field is not present in the "
    "section text, return an empty string or empty list — never invent."
)


def _section_prompt(section: SectionContent) -> str:
    """Build the user prompt for a single section extraction.

    Keeps the prompt tight — Ollama's `format=<schema>` parameter does
    the schema enforcement, so we don't repeat the schema in the prompt.
    """
    title = section.title_ar or section.title_en or section.section_key
    return (
        f"# Section\n"
        f"key: {section.section_key}\n"
        f"title: {title}\n\n"
        f"# Section text\n"
        f"```\n{section.raw_text}\n```\n\n"
        "Return the JSON object describing the facts found in this "
        "section. Use the schema you were given as the format constraint."
    )


# ---------- single-section extraction ---------------------------------------


@dataclass
class SectionExtraction:
    section_key: str
    payload: dict   # validated through SECTION_SCHEMAS[section_key]; may be {}
    duration_ms: int
    model: str
    started_at: float  # monotonic-ish; used to verify group parallelism


async def extract_one_section(
    section: SectionContent,
    *,
    classification: Classification,
    persona: str | None,
    model: str | None,
    provider: Provider = Provider.LOCAL_OLLAMA,
) -> SectionExtraction:
    """Extract structured facts for a single section with one retry on
    schema validation failure. On the second failure, returns an empty
    payload so the parent dossier still persists.
    """
    schema_cls = schema_for(section.section_key)
    if schema_cls is None:
        # `front_matter` and any other unknown keys are skipped.
        logger.info(
            "extractor: skipping section_key=%r (no schema registered)",
            section.section_key,
        )
        return SectionExtraction(
            section_key=section.section_key,
            payload={},
            duration_ms=0,
            model="",
            started_at=time.monotonic(),
        )

    used_persona = (persona or "").strip() or _DEFAULT_PERSONA
    prompt = _section_prompt(section)
    started = time.monotonic()
    logger.info(
        "extractor: section=%s extraction_started chars=%d model=%s",
        section.section_key, len(section.raw_text), model or _resolve_default_model(),
    )

    last_err: Exception | None = None
    for attempt in (1, 2):
        try:
            result: StructuredResult = await generate_structured(
                prompt=prompt,
                schema=schema_cls,
                classification=classification,
                system=used_persona,
                model=model,
                provider=provider,
            )
            payload = result.parsed.model_dump(mode="json")
            # Defensive re-validation — should always pass since
            # generate_structured validated; cheap insurance against
            # future refactors that bypass that path.
            payload = validate_section_payload(section.section_key, payload)
            logger.info(
                "extractor: section=%s extraction_ok attempt=%d duration_ms=%d",
                section.section_key, attempt, result.duration_ms,
            )
            return SectionExtraction(
                section_key=section.section_key,
                payload=payload,
                duration_ms=result.duration_ms,
                model=result.model,
                started_at=started,
            )
        except (ValidationError, ValueError) as e:
            last_err = e
            logger.warning(
                "extractor: section=%s extraction_invalid attempt=%d err=%s",
                section.section_key, attempt, e,
            )
            continue
        except Exception as e:  # noqa: BLE001 — fail-closed for transport errors too
            last_err = e
            logger.exception(
                "extractor: section=%s extraction_error attempt=%d", section.section_key, attempt,
            )
            continue

    logger.error(
        "extractor: section=%s gave up after 2 attempts (storing empty); last_err=%s",
        section.section_key, last_err,
    )
    return SectionExtraction(
        section_key=section.section_key,
        payload={},
        duration_ms=0,
        model=model or _resolve_default_model(),
        started_at=started,
    )


# ---------- top-level orchestration -----------------------------------------


def compute_source_hash(file_bytes: bytes) -> str:
    """Stable cache key for the .pptx bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


async def find_cached_dossier(
    db: AsyncSession,
    *,
    proposal_id: int,
    source_hash: str,
    model: str,
) -> DossierRow | None:
    q = await db.execute(
        select(DossierRow).where(
            DossierRow.proposal_id == proposal_id,
            DossierRow.source_hash == source_hash,
            DossierRow.model == model,
        )
    )
    return q.scalar_one_or_none()


async def extract_dossier(
    db: AsyncSession,
    *,
    proposal_id: int,
    file_bytes: bytes,
    persona: str | None = None,
    model: str | None = None,
    classification: Classification | None = None,
) -> DossierRow:
    """Run the full extraction pipeline. Idempotent on cache key.

    Caller (Celery task or test) is responsible for committing the
    AsyncSession after the call returns successfully.
    """
    used_model = model or _resolve_default_model()
    source_hash = compute_source_hash(file_bytes)

    # 1. Cache lookup
    existing = await find_cached_dossier(
        db, proposal_id=proposal_id, source_hash=source_hash, model=used_model
    )
    if existing is not None:
        logger.info(
            "extractor: dossier_cache_hit=True proposal_id=%s hash=%s model=%s",
            proposal_id, source_hash[:12], used_model,
        )
        return existing

    logger.info(
        "extractor: dossier_cache_hit=False proposal_id=%s hash=%s model=%s — extracting",
        proposal_id, source_hash[:12], used_model,
    )

    # 2. Resolve classification (default Restricted; explicit override wins)
    proposal_classification = classification
    if proposal_classification is None:
        proposal_classification = await _load_classification(db, proposal_id)

    # 3. Split deterministically (no LLM)
    sections: ProposalSections = split_pptx(file_bytes)
    extractable: list[SectionContent] = [
        sec for key, sec in sections.sections.items()
        if key != FRONT_MATTER_KEY
        and key in SECTION_SCHEMAS
        and sec.raw_text.strip()
    ]
    logger.info(
        "extractor: split done total_slides=%d extractable_sections=%d missing=%s",
        sections.total_slides, len(extractable), sections.missing_sections,
    )

    # 4. Parallel per-section extraction
    dispatch_t0 = time.monotonic()
    coros = [
        extract_one_section(
            sec,
            classification=proposal_classification,
            persona=persona,
            model=used_model,
        )
        for sec in extractable
    ]
    results: list[SectionExtraction] = await asyncio.gather(*coros, return_exceptions=False)

    # Verify parallelism: every section's `started_at` must be within 1s
    # of dispatch (covers the spec acceptance criterion).
    if results:
        max_gap = max(r.started_at - dispatch_t0 for r in results)
        logger.info(
            "extractor: parallel_dispatch max_start_gap_s=%.3f sections=%d",
            max_gap, len(results),
        )
        if max_gap > 1.0:
            logger.warning(
                "extractor: parallel dispatch slow — first section started %.3fs after group dispatch",
                max_gap,
            )

    # 5. Assemble dossier
    section_payloads: dict[str, dict] = {
        r.section_key: r.payload for r in results if r.payload
    }
    section_starts: dict[str, int] = {
        key: idx for key, idx in sections.section_starts.items()
        if key in section_payloads
    }

    dossier_model = DossierModel(
        proposal_id=proposal_id,
        source_hash=source_hash,
        extracted_at=datetime.now(tz=timezone.utc),
        model=used_model,
        sections=section_payloads,
        section_starts=section_starts,
    )

    # 6. Persist
    row = DossierRow(
        proposal_id=proposal_id,
        source_hash=source_hash,
        model=used_model,
        dossier_json=dossier_model.model_dump(mode="json"),
    )
    db.add(row)
    await db.flush()
    logger.info(
        "extractor: dossier_persisted id=%s sections=%d",
        row.id, len(section_payloads),
    )
    return row


async def _load_classification(db: AsyncSession, proposal_id: int) -> Classification:
    """Look up the proposal's classification field. Defaults to
    `Restricted` if the proposal row can't be found — fail-closed."""
    q = await db.execute(
        select(Proposal.classification).where(Proposal.id == proposal_id)
    )
    raw = q.scalar_one_or_none()
    return Classification.coerce(raw)

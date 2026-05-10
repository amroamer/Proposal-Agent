"""Phase 4 — criterion runner.

For a given (proposal, framework) pair:
  1. Ensure the proposal has a Phase-3 dossier; if not, build it.
  2. Group the framework's criteria by their `group` tag.
  3. For each group:
       a. Look up GROUP_TO_SECTIONS (Phase-5 will override per-criterion
          via `evidence_source`; the runner already prefers a per-
          criterion override when present).
       b. Build the dossier subset (or whole dossier on `["*"]`).
       c. Make ONE batched LLM call: persona as system, criteria + dossier
          subset as user, JSON Schema requiring one evaluation per criterion.
  4. Persist all evaluations into `proposal_criterion_reviews`.

ONE LLM call per group per run — count is logged and asserted in tests.

The output schema is enforced via Ollama's `format` parameter; we never
regex-match or `json.loads` model output.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Iterable, Literal

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dossier import Dossier as DossierRow
from app.models.proposal_criterion_review import ProposalCriterionReview
from app.models.review_framework import ReviewFramework

from .extractor import extract_dossier
from .group_routing import (
    DEFAULT_FALLBACK,
    WILDCARD,
    is_wildcard,
    resolve_sections_for_group,
    validate_evidence_source,
)
from .llm_client import (
    Classification,
    Provider,
    _resolve_default_model,
    generate_structured,
)
from .section_mapping import SECTION_KEYS

logger = logging.getLogger(__name__)


# ---------- output schema (enforced by Ollama `format`) -----------------------


_ScoreLabel = Literal["red", "amber", "green"]
_Language = Literal["ar", "en"]


class CriterionEvaluation(BaseModel):
    """One LLM evaluation result. Field shapes mirror the
    proposal_criterion_reviews columns 1:1 so persistence is direct."""

    criterion_id: str
    score: int = Field(ge=0, le=5)
    score_label: _ScoreLabel
    evidence: str = ""
    gaps: list[str] = Field(default_factory=list)
    slides_referenced: list[int] = Field(default_factory=list)
    language_used: _Language = "ar"


class CriterionEvaluationBatch(BaseModel):
    """Wrapper schema for the per-group batched call. The model must
    return one CriterionEvaluation per criterion sent in the prompt."""

    evaluations: list[CriterionEvaluation] = Field(default_factory=list)


# ---------- prompt construction ----------------------------------------------


def _detect_language(text: str) -> str:
    """Heuristic: ratio of Arabic characters in the section. Used to
    tell the LLM which prompt_instruction language to consume."""
    if not text:
        return "ar"
    arabic_chars = sum(1 for ch in text if "؀" <= ch <= "ۿ")
    total = sum(1 for ch in text if ch.isalpha())
    if total == 0:
        return "ar"
    return "ar" if (arabic_chars / total) >= 0.3 else "en"


def _build_dossier_subset(
    dossier_json: dict,
    section_keys: list[str],
) -> dict:
    """Pick out the requested sections from a dossier. `["*"]` returns
    the full sections dict.

    Returns `{section_key: facts_dict, ...}` in canonical order."""
    sections = dossier_json.get("sections", {}) or {}
    if is_wildcard(section_keys):
        ordered = [(k, sections[k]) for k in SECTION_KEYS if k in sections]
        return dict(ordered)
    return {k: sections[k] for k in section_keys if k in sections}


def _criteria_prompt_block(criteria: list[dict], language: str) -> str:
    """Render the criteria as a numbered list with name + instruction.
    Each is keyed off its criterion_id so the model can return matched
    rows in `evaluations`."""
    name_field = "name_ar" if language == "ar" else "name_en"
    instr_field = "prompt_instruction_ar" if language == "ar" else "prompt_instruction_en"
    parts: list[str] = []
    for c in criteria:
        cid = c.get("criterion_id") or c.get("id") or c.get("name_en") or c.get("name") or ""
        name = (c.get(name_field) or c.get("name_en") or c.get("name") or "").strip()
        instr = (c.get(instr_field) or c.get("prompt_instruction_en")
                 or c.get("prompt_instruction") or "").strip()
        parts.append(
            f"- criterion_id: {cid}\n"
            f"  name: {name}\n"
            f"  instruction: {instr}"
        )
    return "\n".join(parts)


def _build_group_prompt(
    *,
    group: str,
    criteria: list[dict],
    dossier_subset: dict,
    section_starts: dict[str, int],
    language: str,
) -> str:
    sections_block_parts: list[str] = []
    for key, facts in dossier_subset.items():
        starts = section_starts.get(key)
        sections_block_parts.append(
            f"## {key}"
            f"{f' (starts on slide {starts})' if starts else ''}\n"
            f"```json\n{facts}\n```"
        )
    sections_block = "\n\n".join(sections_block_parts) or "(no sections)"

    return (
        f"# Group\n{group}\n\n"
        f"# Dossier subset\nThe following structured facts were extracted "
        f"from the proposal. Each section is keyed by its canonical name; "
        f"slide numbers are noted for citing.\n\n"
        f"{sections_block}\n\n"
        f"# Criteria to evaluate\n{_criteria_prompt_block(criteria, language)}\n\n"
        "# Output\nReturn a JSON object with key `evaluations`: a list "
        "containing one entry per criterion above. Each entry MUST set "
        "`criterion_id` to match the input. Score 0–5 (0 = entirely "
        "missing, 5 = fully addressed); `score_label` is 'red' (0–1), "
        "'amber' (2–3), or 'green' (4–5). `slides_referenced` is a list "
        "of slide numbers you cited as evidence. Do not invent content "
        "not present in the dossier."
    )


# ---------- evidence-source resolution per criterion ------------------------


def _resolve_sections_for_criterion(criterion: dict) -> list[str]:
    """Phase 4: routing comes from GROUP_TO_SECTIONS via the criterion's
    `group` tag. Phase 5 will populate `evidence_source` per criterion;
    when present, that overrides the group routing.

    The override is plumbed in NOW so Phase 5 only has to:
      - add the column,
      - backfill it,
      - update the API to surface it.

    The runner stays unchanged.
    """
    override = criterion.get("evidence_source")
    if override:
        try:
            return validate_evidence_source(list(override))
        except ValueError as e:
            logger.warning(
                "criterion_runner: invalid evidence_source on criterion %r: %s "
                "— falling back to group routing",
                criterion.get("criterion_id") or criterion.get("name_en"), e,
            )
    return resolve_sections_for_group(criterion.get("group"))


def _group_criteria(criteria: list[dict]) -> dict[tuple[str, tuple[str, ...]], list[dict]]:
    """Group criteria by (group_tag, resolved_sections_tuple).

    Same group + same evidence_source override = one LLM call. Different
    overrides under the same group = separate batched calls (the prompts
    carry different dossier subsets).

    Returns a dict whose key is (group_label, sections_tuple) so logs
    can show what was sent.
    """
    bucket: dict[tuple[str, tuple[str, ...]], list[dict]] = {}
    for c in criteria:
        group = (c.get("group") or "").strip() or "Ungrouped"
        sections = tuple(_resolve_sections_for_criterion(c))
        bucket.setdefault((group, sections), []).append(c)
    return bucket


# ---------- ensure dossier ---------------------------------------------------


async def _ensure_dossier(
    db: AsyncSession,
    *,
    proposal_id: int,
    file_bytes: bytes | None,
    classification: Classification,
    persona: str | None,
    extraction_model: str,
) -> DossierRow:
    """Load the most recent dossier for `proposal_id`. If none exists,
    require `file_bytes` and run extraction inline."""
    q = await db.execute(
        select(DossierRow)
        .where(DossierRow.proposal_id == proposal_id)
        .order_by(DossierRow.extracted_at.desc())
        .limit(1)
    )
    row = q.scalar_one_or_none()
    if row is not None:
        return row
    if not file_bytes:
        raise ValueError(
            f"No dossier exists for proposal_id={proposal_id} and no "
            "file_bytes were provided to build one."
        )
    return await extract_dossier(
        db,
        proposal_id=proposal_id,
        file_bytes=file_bytes,
        persona=persona,
        model=extraction_model,
        classification=classification,
    )


# ---------- top-level run ----------------------------------------------------


async def run_review(
    db: AsyncSession,
    *,
    proposal_id: int,
    framework: ReviewFramework,
    classification: Classification,
    file_bytes: bytes | None = None,
    review_model: str | None = None,
    extraction_model: str | None = None,
) -> list[ProposalCriterionReview]:
    """Run the full per-criterion review for one proposal+framework.

    Args:
      db: open async session — caller commits.
      proposal_id: target proposal row.
      framework: ReviewFramework (with .persona_instruction, .criteria,
        .persona_instruction_ar).
      classification: data-sovereignty class (gates LLM provider).
      file_bytes: only required when no dossier exists yet for this
        proposal — passed through to extract_dossier.
      review_model: override the model used for the per-group review
        calls (defaults to the framework's `model`, then env default).
      extraction_model: override the model used IF a dossier needs to be
        built. Independent of review_model.

    Returns:
      List of persisted ProposalCriterionReview rows (db.flush()'d but
      NOT committed — caller commits).
    """
    used_extraction_model = extraction_model or _resolve_default_model()
    persona_en = (framework.persona_instruction or "").strip()
    persona_ar = (framework.persona_instruction_ar or "").strip()

    dossier = await _ensure_dossier(
        db,
        proposal_id=proposal_id,
        file_bytes=file_bytes,
        classification=classification,
        persona=persona_en or persona_ar,
        extraction_model=used_extraction_model,
    )
    dossier_json = dict(dossier.dossier_json or {})

    all_criteria = list(framework.criteria or [])
    # Ensure every criterion has a stable id — fall back to its index
    # when the framework's stored entries don't have one. Done BEFORE
    # the active filter so re-activating an inactive criterion keeps
    # its existing id stable across edits.
    for idx, c in enumerate(all_criteria):
        if not (c.get("criterion_id") or c.get("id")):
            c["criterion_id"] = f"c{idx + 1}"
        else:
            c["criterion_id"] = str(c.get("criterion_id") or c.get("id"))

    # Skip inactive criteria. Default is active=True (legacy criteria
    # stored before the toggle existed have no `active` key).
    criteria = [c for c in all_criteria if c.get("active", True)]
    skipped = len(all_criteria) - len(criteria)
    if skipped:
        logger.info(
            "criterion_runner: skipped %d inactive criteria (out of %d)",
            skipped, len(all_criteria),
        )

    # Single grouping pass — used both for the call dispatch and for
    # the test-assertable call count.
    buckets = _group_criteria(criteria)
    distinct_groups = len(buckets)
    logger.info(
        "criterion_runner: proposal_id=%s framework_id=%s active_criteria=%d "
        "distinct_buckets=%d",
        proposal_id, framework.id, len(criteria), distinct_groups,
    )

    used_review_model = review_model or framework.model or _resolve_default_model()

    persisted: list[ProposalCriterionReview] = []
    llm_calls = 0

    for (group, sections_tuple), group_criteria in buckets.items():
        section_keys = list(sections_tuple)
        dossier_subset = _build_dossier_subset(dossier_json, section_keys)
        section_starts = dossier_json.get("section_starts", {}) or {}

        # Detect dominant language across the subset to pick AR / EN
        # criterion field set + persona.
        joined = "\n".join(str(v) for v in dossier_subset.values())
        language = _detect_language(joined)
        persona = persona_ar if language == "ar" and persona_ar else (persona_en or persona_ar)

        prompt = _build_group_prompt(
            group=group,
            criteria=group_criteria,
            dossier_subset=dossier_subset,
            section_starts=section_starts,
            language=language,
        )

        try:
            result = await generate_structured(
                prompt=prompt,
                schema=CriterionEvaluationBatch,
                classification=classification,
                system=persona,
                model=used_review_model,
                provider=Provider.LOCAL_OLLAMA,
            )
            llm_calls += 1
            evaluations: list[CriterionEvaluation] = result.parsed.evaluations
            logger.info(
                "criterion_runner: group=%r sections=%s evaluations=%d duration_ms=%d",
                group, section_keys, len(evaluations), result.duration_ms,
            )
        except Exception as e:  # noqa: BLE001 — fail-open per criterion
            logger.exception(
                "criterion_runner: group=%r call failed — emitting placeholder rows",
                group,
            )
            evaluations = [
                _placeholder_evaluation(c.get("criterion_id"), str(e))
                for c in group_criteria
            ]
            llm_calls += 1  # we DID dispatch the call; failure still counts

        # Index by criterion_id so we can match results to inputs even
        # if the model returned them in a different order.
        by_id = {ev.criterion_id: ev for ev in evaluations}
        for c in group_criteria:
            cid = c["criterion_id"]
            ev = by_id.get(cid) or _placeholder_evaluation(cid, "missing from model output")
            row = ProposalCriterionReview(
                proposal_id=proposal_id,
                framework_id=framework.id,
                criterion_id=cid,
                score=ev.score,
                score_label=ev.score_label,
                evidence=ev.evidence,
                gaps=list(ev.gaps),
                slides_referenced=list(ev.slides_referenced),
                language_used=ev.language_used,
            )
            db.add(row)
            persisted.append(row)

    await db.flush()
    logger.info(
        "criterion_runner: proposal_id=%s framework_id=%s total_llm_calls=%d "
        "rows_persisted=%d",
        proposal_id, framework.id, llm_calls, len(persisted),
    )
    # Spec acceptance criterion — exposed on the return so tests can
    # check it without parsing logs.
    setattr(run_review, "_last_llm_call_count", llm_calls)
    return persisted


def _placeholder_evaluation(criterion_id: str | None, reason: str) -> CriterionEvaluation:
    """Used when the LLM call failed or omitted a criterion in the
    response. Score 0 / red so the operator notices."""
    return CriterionEvaluation(
        criterion_id=criterion_id or "unknown",
        score=0,
        score_label="red",
        evidence=f"Evaluation failed: {reason}",
        gaps=["Evaluation failed — see evidence."],
        slides_referenced=[],
        language_used="ar",
    )


async def latest_review_rows(
    db: AsyncSession,
    *,
    proposal_id: int,
    framework_id: int | None = None,
) -> list[ProposalCriterionReview]:
    """Return the most-recent batch of criterion reviews for a proposal,
    optionally filtered by framework. Used by GET .../reviews/latest."""
    stmt = select(ProposalCriterionReview).where(
        ProposalCriterionReview.proposal_id == proposal_id
    )
    if framework_id is not None:
        stmt = stmt.where(ProposalCriterionReview.framework_id == framework_id)
    stmt = stmt.order_by(ProposalCriterionReview.created_at.desc())
    q = await db.execute(stmt)
    return list(q.scalars().all())


# Re-export bucket discovery so the API endpoint can return a dry-run
# routing summary if needed.
__all__ = [
    "CriterionEvaluation",
    "CriterionEvaluationBatch",
    "_resolve_sections_for_criterion",
    "_group_criteria",
    "_build_group_prompt",
    "_build_dossier_subset",
    "_detect_language",
    "latest_review_rows",
    "run_review",
]

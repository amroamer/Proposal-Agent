"""Review-framework CRUD + AI-assisted helpers."""
import json
import logging
import re

from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review_framework import ReviewFramework
from app.models.user import User
from app.schemas.framework import (
    FrameworkCreate,
    FrameworkCriterion,
    FrameworkUpdate,
)
from app.services import file_parser_service, ollama_service

logger = logging.getLogger(__name__)


def _criteria_to_db(criteria) -> list[dict]:
    return [c.model_dump() if hasattr(c, "model_dump") else dict(c) for c in (criteria or [])]


async def create(db: AsyncSession, *, user: User, req: FrameworkCreate) -> ReviewFramework:
    fw = ReviewFramework(
        owner_user_id=user.id,
        name=req.name.strip(),
        persona_instruction=req.persona_instruction or "",
        persona_instruction_ar=req.persona_instruction_ar or "",
        model=req.model.strip() or "gemma4:latest",
        is_public=req.is_public,
        criteria=_criteria_to_db(req.criteria),
    )
    db.add(fw)
    await db.commit()
    await db.refresh(fw)
    return fw


async def list_visible(
    db: AsyncSession, *, user: User, search: str | None = None, limit: int = 100, offset: int = 0
) -> tuple[list[ReviewFramework], int]:
    """User sees: their own frameworks + everyone's public frameworks."""
    base = select(ReviewFramework).where(
        or_(
            ReviewFramework.owner_user_id == user.id,
            ReviewFramework.is_public.is_(True),
        )
    )
    if search:
        base = base.where(func.lower(ReviewFramework.name).like(f"%{search.lower()}%"))

    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(ReviewFramework.updated_at.desc()).limit(limit).offset(offset)
    )
    return list(rows_q.scalars().all()), total


async def get_visible(
    db: AsyncSession, *, user: User, framework_id: int
) -> ReviewFramework | None:
    q = await db.execute(
        select(ReviewFramework).where(
            ReviewFramework.id == framework_id,
            or_(
                ReviewFramework.owner_user_id == user.id,
                ReviewFramework.is_public.is_(True),
            ),
        )
    )
    return q.scalar_one_or_none()


async def update(
    db: AsyncSession, *, item: ReviewFramework, req: FrameworkUpdate
) -> ReviewFramework:
    if req.name is not None:
        item.name = req.name.strip()
    if req.persona_instruction is not None:
        item.persona_instruction = req.persona_instruction
    if req.persona_instruction_ar is not None:
        item.persona_instruction_ar = req.persona_instruction_ar
    if req.model is not None:
        item.model = req.model.strip() or "gemma4:latest"
    if req.is_public is not None:
        item.is_public = req.is_public
    if req.criteria is not None:
        item.criteria = _criteria_to_db(req.criteria)
    await db.commit()
    await db.refresh(item)
    return item


async def delete(db: AsyncSession, *, item: ReviewFramework) -> None:
    await db.delete(item)
    await db.commit()


# -------- AI-assisted: generate criteria from a sample file --------

AUTOGEN_SYSTEM = (
    "You are an expert proposal-review designer. You read sample proposals or "
    "review checklists and extract a structured set of review criteria (dimensions). "
    "Each criterion has a short Name (English), a one-sentence Description (English), "
    "a Prompt Instruction telling another AI exactly how to evaluate that dimension, "
    "and an optional Group label for categorisation."
)

AUTOGEN_USER_TMPL = (
    "Below is the source content of a sample document. Extract 5–15 review "
    "criteria that a senior consultant would use to audit a proposal of this "
    "type. Output VALID JSON only — a single JSON object with one key "
    '"criteria" whose value is an array. Each array element MUST be an object '
    'with exactly four string keys: "name_en", "description_en", '
    '"prompt_instruction_en", and "group" (a short category label like '
    '"Strategic Fit", "Technical Approach", "Commercial", "Compliance", etc.). '
    "Do NOT wrap the JSON in markdown fences. Do NOT add commentary before or "
    "after.\n\n"
    "Source document:\n```\n{doc_text}\n```"
)


def _parse_criteria_json(text: str) -> list[FrameworkCriterion]:
    """Best-effort: pull a JSON object out of the LLM response and validate."""
    # Strip code fences if the model added them despite instructions.
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)

    # If the model emitted just an array, try wrapping it.
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: find the first { ... } block.
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            raise ValueError("AI response was not valid JSON.")
        data = json.loads(m.group(0))

    if isinstance(data, list):
        raw = data
    elif isinstance(data, dict):
        raw = data.get("criteria") or data.get("items") or []
    else:
        raise ValueError("AI response had unexpected shape.")

    out: list[FrameworkCriterion] = []
    for c in raw:
        if not isinstance(c, dict):
            continue
        try:
            # Accept both new (_en) and legacy field names — the Pydantic
            # model_validator handles the migration transparently.
            out.append(FrameworkCriterion.model_validate(c))
        except Exception:
            continue
    return out


async def autogen_from_file(
    *, filename: str, file_bytes: bytes
) -> list[FrameworkCriterion]:
    """Extract text from the uploaded sample, ask the LLM for criteria,
    parse the JSON response, return validated criteria."""
    doc_text, _kind = file_parser_service.extract_text(filename, file_bytes)
    # Cap the doc text we send to keep latency reasonable.
    if len(doc_text) > 40_000:
        doc_text = doc_text[:40_000]
    prompt = AUTOGEN_USER_TMPL.format(doc_text=doc_text)
    result = await ollama_service.generate(prompt, system=AUTOGEN_SYSTEM)
    criteria = _parse_criteria_json(result.output)
    if not criteria:
        raise ValueError(
            "Could not extract any criteria from the AI response. "
            "Try a clearer sample, or define dimensions manually."
        )
    return criteria

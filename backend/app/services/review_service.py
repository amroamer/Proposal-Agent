"""Review service: orchestrates parse -> Ollama -> persist.

Two modes are supported:
  1) Framework-based — the user picks one or more `review_frameworks`. Their
     persona + criteria become the system + user prompts.
  2) Free-form — the user types a one-shot review brief; we use the default
     KPMG-flavoured persona below.

Streaming mode (run_review_streaming) evaluates each criterion independently
and yields SSE-formatted events as each one completes.
"""
import json
import logging
import re
import time
from typing import AsyncGenerator

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.proposal_review import ProposalReview
from app.models.review_framework import ReviewFramework
from app.models.user import User
from app.services import file_parser_service, llm_pref_service, ollama_service

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are a senior KPMG Saudi Arabia Advisory proposal reviewer. "
    "You critically evaluate consulting proposals against the user's review brief. "
    "You write in clear, structured Markdown with: 1) a one-paragraph executive verdict, "
    "2) Strengths (bullets), 3) Weaknesses & risks (bullets), 4) Specific section-by-section "
    "comments, 5) Required edits before submission. "
    "Be specific, cite slide/page numbers when the source includes them, "
    "and be candid about weaknesses. Never invent content not present in the document."
)

# Hard cap on document text we send to the model. Defensive trim so a
# 200-slide deck doesn't blow the request even with large-context models.
MAX_DOC_CHARS = 60_000

PROMPT_PREVIEW_CHARS = 200


def _truncated_doc(doc_text: str) -> tuple[str, str]:
    if len(doc_text) > MAX_DOC_CHARS:
        return (
            doc_text[:MAX_DOC_CHARS],
            "\n\n[Note: source document was truncated to fit the review window.]",
        )
    return doc_text, ""


def _build_freeform_prompt(review_brief: str, doc_text: str, filename: str) -> str:
    doc, note = _truncated_doc(doc_text)
    return (
        f"# Review brief\n{review_brief.strip()}\n\n"
        f"# Source document\nFilename: {filename}\n\n"
        f"```\n{doc}\n```{note}\n\n"
        "Please produce the structured review now."
    )


def _build_framework_prompt(
    framework: ReviewFramework, doc_text: str, filename: str
) -> str:
    doc, note = _truncated_doc(doc_text)
    criteria_text = ""
    for i, c in enumerate(framework.criteria or [], start=1):
        name = (c.get("name_en") or c.get("name") or "").strip()
        instr = (c.get("prompt_instruction_en") or c.get("prompt_instruction") or "").strip()
        if not name or not instr:
            continue
        criteria_text += f"\n## {i}. {name}\n{instr}\n"

    return (
        f"# Source document\nFilename: {filename}\n\n"
        f"```\n{doc}\n```{note}\n\n"
        "# Review framework\n"
        f"Framework: **{framework.name}**\n"
        "For EACH criterion below, evaluate the document and produce a finding. "
        "Output a structured Markdown report with one section per criterion. "
        "For each section include:\n"
        "- **Status** — one of ✅ Pass / ⚠️ Partial / ❌ Fail / 🟡 N/A\n"
        "- **Findings** — what you observed, with specific slide/page references where possible\n"
        "- **Recommendations** — concrete edits or additions required\n\n"
        "End with a one-paragraph **Executive verdict** summarising overall readiness.\n"
        f"\n# Criteria\n{criteria_text}\n"
    )


def _build_multiframework_prompt(
    frameworks: list[ReviewFramework],
    disabled: set[str],
    doc_text: str,
    filename: str,
) -> tuple[str, str, str]:
    """Returns (system_prompt, user_prompt, model). Merges criteria across all
    frameworks, deduplicating by name and skipping any in `disabled`."""
    doc, note = _truncated_doc(doc_text)

    # Use the first framework's persona as the system prompt; it's the one the
    # user picked first and so most likely the dominant context.
    system_prompt = (
        frameworks[0].persona_instruction.strip() if frameworks else ""
    ) or DEFAULT_SYSTEM_PROMPT

    seen: set[str] = set()
    criteria_blocks: list[str] = []
    counter = 0
    for fw in frameworks:
        for c in fw.criteria or []:
            name = (c.get("name_en") or c.get("name") or "").strip()
            instr = (c.get("prompt_instruction_en") or c.get("prompt_instruction") or "").strip()
            if not name or not instr:
                continue
            if name in seen or name in disabled:
                continue
            seen.add(name)
            counter += 1
            criteria_blocks.append(f"\n## {counter}. {name}\n{instr}\n")

    framework_label = " + ".join(f.name for f in frameworks) if frameworks else "ad-hoc"

    user_prompt = (
        f"# Source document\nFilename: {filename}\n\n"
        f"```\n{doc}\n```{note}\n\n"
        "# Review framework\n"
        f"Framework: **{framework_label}**\n"
        "For EACH criterion below, evaluate the document and produce a finding. "
        "Output a structured Markdown report with one section per criterion. "
        "For each section include:\n"
        "- **Status** — one of ✅ Pass / ⚠️ Partial / ❌ Fail / 🟡 N/A\n"
        "- **Findings** — what you observed, with specific slide/page references where possible\n"
        "- **Recommendations** — concrete edits or additions required\n\n"
        "End with a one-paragraph **Executive verdict** summarising overall readiness.\n"
        f"\n# Criteria\n{''.join(criteria_blocks)}\n"
    )

    # Use the first framework's model as the chosen model.
    model_to_use = (frameworks[0].model if frameworks else "") or ollama_service.DEFAULT_MODEL

    return system_prompt, user_prompt, model_to_use


def _build_single_criterion_prompt(
    criterion: dict,
    doc_text: str,
    filename: str,
    metadata: dict | None = None,
) -> str:
    """Build a focused prompt for evaluating ONE criterion against the document."""
    doc, note = _truncated_doc(doc_text)
    name = (criterion.get("name_en") or criterion.get("name") or "").strip()
    instr = (criterion.get("prompt_instruction_en") or criterion.get("prompt_instruction") or "").strip()

    meta_block = ""
    if metadata:
        meta_parts = []
        if metadata.get("document_title"):
            meta_parts.append(f"- Title: {metadata['document_title']}")
        if metadata.get("client_name"):
            meta_parts.append(f"- Client: {metadata['client_name']}")
        if metadata.get("purpose_and_scope"):
            meta_parts.append(f"- Scope: {metadata['purpose_and_scope']}")
        if meta_parts:
            meta_block = "# Document metadata\n" + "\n".join(meta_parts) + "\n\n"

    return (
        f"# Source document\nFilename: {filename}\n\n"
        f"```\n{doc}\n```{note}\n\n"
        f"{meta_block}"
        f"# Evaluation criterion\n"
        f"## {name}\n{instr}\n\n"
        "# Output format\n"
        "Evaluate the document against this single criterion. You MUST start your response with EXACTLY this line:\n"
        "Score: X/10\n\n"
        "Where X is a numerical score from 1 to 10 (decimals like 7.5 are allowed).\n"
        "Scoring guide:\n"
        "- 9-10: Excellent, fully meets the criterion with best practices\n"
        "- 7-8: Good, meets the criterion with minor gaps\n"
        "- 5-6: Adequate, partially meets but has notable gaps\n"
        "- 3-4: Weak, significant deficiencies that need fixing\n"
        "- 1-2: Critical failure, criterion is barely addressed\n\n"
        "After the score line, provide:\n"
        "- **Summary** — one sentence assessment\n"
        "- **Findings** — what you observed, citing page/slide numbers where possible\n"
        "- **Recommendations** — concrete edits or additions required\n\n"
        "Be specific and concise. Do NOT invent content not present in the document."
    )


def _extract_score(output: str) -> float:
    """Extract numerical score from LLM output. Expects 'Score: X/10' at the start."""
    # Look for "Score: X/10" pattern in first 100 chars
    head = output[:100]
    m = re.search(r"[Ss]core:\s*([\d.]+)\s*/\s*10", head)
    if m:
        try:
            score = float(m.group(1))
            return max(1.0, min(10.0, score))
        except ValueError:
            pass
    # Fallback: try to find any number/10 pattern
    m = re.search(r"([\d.]+)\s*/\s*10", head)
    if m:
        try:
            score = float(m.group(1))
            return max(1.0, min(10.0, score))
        except ValueError:
            pass
    return 5.0  # default middle score if parsing fails


def _extract_status(output: str) -> str:
    """Derive pass/partial/fail/na status from the numerical score."""
    score = _extract_score(output)
    if score >= 7.0:
        return "pass"
    if score >= 5.0:
        return "partial"
    if score >= 1.0:
        return "fail"
    return "na"


async def run_review(
    db: AsyncSession,
    *,
    user: User,
    filename: str,
    file_bytes: bytes,
    review_prompt: str | None = None,
    framework: ReviewFramework | None = None,
    frameworks: list[ReviewFramework] | None = None,
    disabled_criteria: list[str] | None = None,
    metadata: dict | None = None,
    document_class: str = "proposal",
) -> ProposalReview:
    """Parse -> generate -> persist.

    Either `frameworks` (preferred) / `framework` (legacy) or `review_prompt` must be set.
    """
    framework_list: list[ReviewFramework] = list(frameworks or ([] if framework is None else [framework]))
    if not framework_list and not (review_prompt and review_prompt.strip()):
        raise ValueError("Provide at least one framework or a review brief.")

    extracted_text, kind = file_parser_service.extract_text(filename, file_bytes)
    logger.info(
        "review parsed file=%s kind=%s extracted_chars=%d frameworks=%s disabled=%d",
        filename, kind, len(extracted_text),
        [f.id for f in framework_list],
        len(disabled_criteria or []),
    )

    disabled_set = {d.strip() for d in (disabled_criteria or []) if d.strip()}

    if framework_list:
        system_prompt, user_prompt, model_to_use = _build_multiframework_prompt(
            framework_list, disabled_set, extracted_text, filename
        )
        names = " + ".join(f.name for f in framework_list)
        persisted_prompt = f"[Framework] {names}"
        if review_prompt and review_prompt.strip():
            persisted_prompt += f" — {review_prompt.strip()}"
            user_prompt += f"\n\n# Additional reviewer notes\n{review_prompt.strip()}\n"
    else:
        system_prompt = DEFAULT_SYSTEM_PROMPT
        user_prompt = _build_freeform_prompt(review_prompt or "", extracted_text, filename)
        model_to_use = ollama_service.DEFAULT_MODEL
        persisted_prompt = (review_prompt or "").strip()

    # User's saved LLM preference wins. Framework's stored model is the fallback
    # for users who haven't set a preference. Per-user options always apply.
    user_pref = await llm_pref_service.get(db, user=user)
    user_options = dict(user_pref.options) if user_pref else {}
    if user_pref and user_pref.model:
        model_to_use = user_pref.model

    result = await ollama_service.generate(
        user_prompt, system=system_prompt, model=model_to_use, options=user_options
    )

    row = ProposalReview(
        created_by=user.id,
        source_filename=filename,
        source_kind=kind,
        source_size_bytes=len(file_bytes),
        source_bytes=file_bytes,
        extracted_text=extracted_text,
        prompt=persisted_prompt,
        review_output=result.output,
        model=result.model,
        duration_ms=result.duration_ms,
        extracted_metadata=metadata or {},
        framework_ids=[f.id for f in framework_list],
        disabled_criteria=list(disabled_set),
        document_class=document_class,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# -------- AI-driven metadata extraction --------

METADATA_SYSTEM = (
    "You are an information-extraction assistant. You read consulting proposals "
    "and pull a small set of metadata fields. You return STRICT JSON only — no "
    "commentary, no markdown fences, no extra keys."
)

METADATA_USER_TMPL = (
    "Extract the following metadata from the document below. Return a single "
    "JSON object with exactly these string keys: \"document_title\", "
    "\"client_name\", \"submission_date\" (ISO YYYY-MM-DD if you can find one, "
    "else empty), \"purpose_and_scope\" (1–3 sentence summary), and "
    "\"client_mandatory_requirements\" (concise bulleted list of must-have "
    "requirements as a single string with newlines between bullets). Use empty "
    "strings for any field you cannot find. Do NOT invent values.\n\n"
    "Document:\n```\n{doc_text}\n```"
)


def _safe_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        return "\n".join(f"- {x}" for x in v if str(x).strip())
    return str(v).strip()


def _sanitize_loose_json(text: str) -> str:
    """Best-effort fixes for common LLM JSON-ish output:
    - // line comments and /* block */ comments
    - trailing commas before ] or }
    - unquoted property names ({ foo: 1 } -> { "foo": 1 })
    - single-quoted strings ('a' -> "a")
    String contents themselves are preserved exactly when already double-
    quoted; we only operate on structure.
    """
    s = text
    # Strip line and block comments (rare but seen).
    s = re.sub(r"//[^\n]*", "", s)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
    # Trailing commas before close braces/brackets.
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    # Unquoted keys: {foo: ...} or , foo: ... -> {"foo": ...}.
    # Conservative: only matches identifier-ish keys preceded by { or , and
    # followed by a colon, leaving anything already quoted untouched.
    s = re.sub(
        r'([{,]\s*)([A-Za-z_][A-Za-z0-9_\-]*)(\s*:)',
        r'\1"\2"\3',
        s,
    )
    # Convert single-quoted strings to double-quoted.
    # Only the simple case: 'text without internal escaped quotes'.
    s = re.sub(r"'([^'\\]*)'", r'"\1"', s)
    return s


def _parse_metadata_json(text: str) -> dict:
    """Tolerant parser for the LLM's metadata JSON response.

    Tries strict JSON first, then progressively sanitizes common LLM
    malformations (markdown fences, trailing commas, single-quoted strings,
    unquoted property names, leading/trailing prose) until parsing succeeds
    or every recovery attempt fails.
    """
    raw = text.strip()
    # Strip markdown code fences anywhere (not just edges).
    cleaned = re.sub(r"```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    cleaned = cleaned.replace("```", "").strip()

    candidates: list[str] = [cleaned]
    # Try just the first balanced-looking object in the response.
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m and m.group(0) != cleaned:
        candidates.append(m.group(0))
    # Apply progressive sanitization to the most-likely-JSON slice.
    sanitized = _sanitize_loose_json(candidates[-1])
    if sanitized != candidates[-1]:
        candidates.append(sanitized)

    last_err: Exception | None = None
    data: object = None
    for c in candidates:
        try:
            data = json.loads(c)
            break
        except json.JSONDecodeError as e:
            last_err = e
            continue
    else:
        # All attempts failed — surface a clipped preview of the LLM output
        # so the operator can see what the model actually returned.
        preview = raw[:240].replace("\n", " ")
        raise ValueError(
            f"AI metadata response was not valid JSON: {last_err}. "
            f"First 240 chars: {preview!r}"
        )

    if not isinstance(data, dict):
        raise ValueError("AI metadata response was not a JSON object.")
    return {
        "document_title": _safe_str(data.get("document_title")),
        "client_name": _safe_str(data.get("client_name")),
        "submission_date": _safe_str(data.get("submission_date")),
        "purpose_and_scope": _safe_str(data.get("purpose_and_scope")),
        "client_mandatory_requirements": _safe_str(data.get("client_mandatory_requirements")),
    }


async def extract_metadata(
    *,
    filename: str,
    file_bytes: bytes,
    db: AsyncSession | None = None,
    user: User | None = None,
) -> dict:
    """Parse file → ask LLM for structured metadata → return normalised dict.

    If `db` and `user` are provided, the user's preferred model + options
    are applied. Otherwise the system defaults are used.
    """
    doc_text, _ = file_parser_service.extract_text(filename, file_bytes)
    if len(doc_text) > 30_000:
        doc_text = doc_text[:30_000]
    prompt = METADATA_USER_TMPL.format(doc_text=doc_text)

    model = ollama_service.DEFAULT_MODEL
    options: dict = {}
    if db is not None and user is not None:
        pref = await llm_pref_service.get(db, user=user)
        if pref:
            if pref.model:
                model = pref.model
            options = dict(pref.options or {})

    result = await ollama_service.generate(
        prompt, system=METADATA_SYSTEM, model=model, options=options, format="json"
    )
    return _parse_metadata_json(result.output)


async def list_for_user(
    db: AsyncSession, *, user: User, limit: int = 50, offset: int = 0
) -> tuple[list[ProposalReview], int]:
    base = select(ProposalReview).where(ProposalReview.created_by == user.id)
    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(ProposalReview.created_at.desc()).limit(limit).offset(offset)
    )
    return list(rows_q.scalars().all()), total


async def get_for_user(
    db: AsyncSession, *, user: User, review_id: int
) -> ProposalReview | None:
    q = await db.execute(
        select(ProposalReview).where(
            ProposalReview.id == review_id,
            ProposalReview.created_by == user.id,
        )
    )
    return q.scalar_one_or_none()


def _aggregate_score_from_output(review_output: str | None) -> float | None:
    """Parse all `Score: X/10` lines in a review's combined markdown output
    and return the rounded mean (1-decimal). Returns None if no scores
    could be parsed — typically the case for legacy free-form reviews."""
    if not review_output:
        return None
    matches = re.findall(r"[Ss]core:\s*([\d.]+)\s*/\s*10", review_output)
    scores: list[float] = []
    for raw in matches:
        try:
            v = float(raw)
        except ValueError:
            continue
        if 0.0 <= v <= 10.0:
            scores.append(v)
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)


def to_summary_dict(row: ProposalReview) -> dict:
    return {
        "id": row.id,
        "source_filename": row.source_filename,
        "source_kind": row.source_kind,
        "source_size_bytes": row.source_size_bytes,
        "model": row.model,
        "duration_ms": row.duration_ms,
        "prompt_preview": (row.prompt or "")[:PROMPT_PREVIEW_CHARS],
        "document_class": row.document_class,
        "framework_ids": list(row.framework_ids or []),
        "extracted_metadata": dict(row.extracted_metadata or {}),
        "aggregate_score": _aggregate_score_from_output(row.review_output),
        "created_at": row.created_at,
    }


# -------- Streaming per-criterion review --------


async def run_review_streaming(
    db: AsyncSession,
    *,
    user: User,
    filename: str,
    file_bytes: bytes,
    review_prompt: str | None = None,
    frameworks: list[ReviewFramework],
    disabled_criteria: list[str] | None = None,
    metadata: dict | None = None,
    document_class: str = "proposal",
) -> AsyncGenerator[dict, None]:
    """Async generator that evaluates each criterion independently and yields
    SSE event dicts as each one completes. Persists the combined result at end.
    """
    # 1. Parse document (pre-stream — if this fails, caller gets a normal exception)
    extracted_text, kind = file_parser_service.extract_text(filename, file_bytes)
    logger.info(
        "streaming review: file=%s kind=%s chars=%d frameworks=%s",
        filename, kind, len(extracted_text), [f.id for f in frameworks],
    )

    # 2. Build criteria list (deduplicate, honour disabled set)
    disabled_set = {d.strip() for d in (disabled_criteria or []) if d.strip()}
    system_prompt = (
        frameworks[0].persona_instruction.strip() if frameworks else ""
    ) or DEFAULT_SYSTEM_PROMPT

    criteria_list: list[dict] = []
    seen: set[str] = set()
    for fw in frameworks:
        for c in fw.criteria or []:
            name = (c.get("name_en") or c.get("name") or "").strip()
            instr = (c.get("prompt_instruction_en") or c.get("prompt_instruction") or "").strip()
            if not name or not instr:
                continue
            if name in seen or name in disabled_set:
                continue
            seen.add(name)
            criteria_list.append(c)

    # 3. Resolve model + user prefs — user's saved LLM preference wins; the
    # framework's stored model is the fallback when the user hasn't set one.
    model_to_use = (frameworks[0].model if frameworks else "") or ollama_service.DEFAULT_MODEL
    user_pref = await llm_pref_service.get(db, user=user)
    user_options = dict(user_pref.options) if user_pref else {}
    if user_pref and user_pref.model:
        model_to_use = user_pref.model

    # 4. Emit start event
    yield {
        "event": "start",
        "data": {
            "total_criteria": len(criteria_list),
            "framework_names": [f.name for f in frameworks],
            "model": model_to_use,
        },
    }

    # 5. Process each criterion sequentially
    results: list[tuple[int, str, str, int]] = []  # (index, name, output, duration_ms)
    total_start = time.time()

    for idx, criterion in enumerate(criteria_list):
        name = (criterion.get("name_en") or criterion.get("name") or "").strip()
        desc = (criterion.get("description_en") or criterion.get("description") or "").strip()

        yield {
            "event": "criterion_start",
            "data": {"index": idx, "name": name, "description": desc},
        }

        try:
            prompt = _build_single_criterion_prompt(
                criterion, extracted_text, filename, metadata
            )
            result = await ollama_service.generate(
                prompt, system=system_prompt, model=model_to_use, options=user_options
            )
            score = _extract_score(result.output)
            status = _extract_status(result.output)
            yield {
                "event": "criterion_done",
                "data": {
                    "index": idx,
                    "name": name,
                    "status": status,
                    "score": score,
                    "markdown": f"## {idx + 1}. {name}\n\n{result.output}",
                    "duration_ms": result.duration_ms,
                },
            }
            results.append((idx, name, result.output, result.duration_ms))
        except Exception as e:
            logger.warning("criterion %d (%s) failed: %s", idx, name, e)
            yield {
                "event": "criterion_error",
                "data": {"index": idx, "name": name, "error": str(e)},
            }

    # 6. Persist combined review
    total_ms = int((time.time() - total_start) * 1000)
    combined_output = "\n\n".join(
        f"## {idx + 1}. {name}\n\n{output}" for idx, name, output, _ in results
    )

    review_id = None
    if combined_output.strip():
        persisted_prompt = f"[Framework] {' + '.join(f.name for f in frameworks)}"
        if review_prompt and review_prompt.strip():
            persisted_prompt += f" — {review_prompt.strip()}"

        row = ProposalReview(
            created_by=user.id,
            source_filename=filename,
            source_kind=kind,
            source_size_bytes=len(file_bytes),
            source_bytes=file_bytes,
            extracted_text=extracted_text,
            prompt=persisted_prompt,
            review_output=combined_output,
            model=model_to_use,
            duration_ms=total_ms,
            extracted_metadata=metadata or {},
            framework_ids=[f.id for f in frameworks],
            disabled_criteria=list(disabled_set),
            document_class=document_class,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        review_id = row.id

    # 7. Emit done event
    yield {
        "event": "done",
        "data": {
            "review_id": review_id,
            "total_duration_ms": total_ms,
            "succeeded": len(results),
            "failed": len(criteria_list) - len(results),
        },
    }

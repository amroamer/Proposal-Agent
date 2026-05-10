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

from pydantic import ValidationError
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.proposal_review import ProposalReview
from app.models.review_framework import ReviewFramework
from app.models.user import User
from app.services import file_parser_service, llm_pref_service, ollama_service
from app.services.structured_finding import (
    SourceCoverage,
    StructuredFinding,
    StructuredFindingPayload,
    detect_consistency_warnings,
    llm_finding_schema,
    verdict_from_score,
)
from app.services.proposal_review.section_splitter import (
    ProposalSections,
    SectionContent,
    split_pptx,
)
from app.services.proposal_review.section_mapping import (
    SECTION_KEYS,
    arabic_label,
    english_label,
)
from app.services.proposal_review.group_routing import (
    WILDCARD,
    is_wildcard,
)

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

# Hard cap on document text we send to the model. The original 60 KB
# cap was set when 8K-context models were the only option and was
# intended as defensive trim against runaway documents.
#
# Modern caps come from the model's `num_ctx` setting (Ollama
# truncates internally to fit) — see user_llm_preferences.options.
# This char cap is now an outer ceiling that should only kick in for
# pathologically large documents (1000+ slide decks, scanned PDFs).
# 400 KB ≈ 100K–130K tokens depending on language, comfortably above
# qwen2.5:32b's 128K context window.
#
# Concrete consequence: a typical 150–200 slide consulting proposal
# (~250–350 KB extracted) now passes through this cap untouched. The
# model's `num_ctx` becomes the real constraint.
MAX_DOC_CHARS = 400_000

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
    counter = 0
    for c in framework.criteria or []:
        if c.get("active", True) is False:
            continue
        name = (c.get("name_en") or c.get("name") or "").strip()
        instr = (c.get("prompt_instruction_en") or c.get("prompt_instruction") or "").strip()
        if not name or not instr:
            continue
        counter += 1
        criteria_text += f"\n## {counter}. {name}\n{instr}\n"

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
            # Inactive criteria are dropped entirely — same rule as the
            # streaming runner, so the prompt the model sees never
            # mentions a deactivated criterion.
            if c.get("active", True) is False:
                continue
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


def _resolve_evidence_source(criterion: dict) -> list[str]:
    """Read `evidence_source` off a criterion. Defaults to wildcard
    (whole proposal) for criteria stored before the field existed or
    that left it unset. The Pydantic validator on FrameworkCriterion
    enforces shape on writes; here we just normalise reads."""
    raw = criterion.get("evidence_source")
    if not raw or not isinstance(raw, list):
        return [WILDCARD]
    cleaned: list[str] = []
    for v in raw:
        if isinstance(v, str) and v:
            cleaned.append(v)
    return cleaned or [WILDCARD]


def _assemble_criterion_text(
    *,
    full_extracted_text: str,
    sections: ProposalSections | None,
    evidence_source: list[str],
) -> tuple[str, SourceCoverage, list[str]]:
    """Build the document slice this criterion gets evaluated against.

    Returns (criterion_text, coverage, used_section_keys) where:
      - criterion_text: the prompt-ready string the model will see
      - coverage: per-criterion SourceCoverage (slides_total = whole
        deck, slides_sent_min/max counted within criterion_text)
      - used_section_keys: which canonical sections were actually
        included (after intersecting evidence_source with what the
        splitter could find). Empty list means "wildcard / whole doc."

    Behaviour:
      - evidence_source == ["*"] OR sections is None  →  whole proposal.
        sections is None when the source isn't a pptx (we can't reliably
        section-split docx/pdf yet).
      - evidence_source has canonical keys → concatenate raw_text from
        those sections in canonical order. Sections missing from the
        deck are silently skipped (the splitter logs a warning).
      - If the requested sections don't exist in the deck (none match)
        → fall back to whole proposal so the model isn't sent an empty
        prompt. Logged as a warning.
    """
    if is_wildcard(evidence_source) or sections is None:
        return full_extracted_text, _compute_source_coverage(full_extracted_text), []

    parts: list[str] = []
    used: list[str] = []
    for key in SECTION_KEYS:  # canonical order
        if key not in evidence_source:
            continue
        sec = sections.sections.get(key)
        if sec is None or not sec.raw_text.strip():
            continue
        used.append(key)
        # Re-inject `## Slide N` markers via the section's slides so
        # the coverage detector + the model both see slide numbers.
        slide_chunks = [
            f"## Slide {s.slide_number}\n{s.text}" for s in sec.slides if s.text.strip()
        ]
        section_blob = (
            f"\n\n# Section: {english_label(key)}"
            + (f" / {arabic_label(key)}" if arabic_label(key) else "")
            + f"\n\n" + "\n\n".join(slide_chunks)
        )
        parts.append(section_blob)

    if not parts:
        logger.warning(
            "evidence_source %r did not match any section in this deck — "
            "falling back to whole proposal",
            evidence_source,
        )
        return full_extracted_text, _compute_source_coverage(full_extracted_text), []

    criterion_text = "\n".join(parts).strip()
    return criterion_text, _compute_source_coverage(criterion_text), used


def _compute_source_coverage(extracted_text: str) -> SourceCoverage:
    """How much of `extracted_text` did we actually send to the model?

    `extracted_text` already has `## Slide N` (or `## Page N`) markers
    inserted by file_parser_service. We count those in the FULL text
    and in the TRUNCATED slice the model receives, so the UI can show
    'reviewed slides 1–38 of 177' and flag citations outside that range.
    """
    chars_total = len(extracted_text or "")
    char_cap_hit = chars_total > MAX_DOC_CHARS
    chars_sent = min(chars_total, MAX_DOC_CHARS)
    sent_slice = (extracted_text or "")[:chars_sent]

    # Count slide / page markers ('## Slide N' / '## Page N') in the
    # full doc and in the slice the model received. Highest number in
    # the slice = slides_sent_max; full count = slides_total.
    marker_re = re.compile(r"^##\s+(?:Slide|Page)\s+(\d+)\b", re.MULTILINE)
    all_nums = [int(m.group(1)) for m in marker_re.finditer(extracted_text or "")]
    sent_nums = [int(m.group(1)) for m in marker_re.finditer(sent_slice)]
    return SourceCoverage(
        slides_total=max(all_nums) if all_nums else 0,
        slides_sent_min=min(sent_nums) if sent_nums else 1,
        slides_sent_max=max(sent_nums) if sent_nums else None,
        chars_sent=chars_sent,
        chars_total=chars_total,
        char_cap_hit=char_cap_hit,
    )


def _structured_to_markdown(finding: StructuredFinding) -> str:
    """Render a StructuredFinding to Markdown for the legacy export path
    (Excel / PDF builders read review_output, not findings). The shape
    matches what the previous prose-based prompts produced so existing
    exports keep working without re-templating."""
    lines: list[str] = [f"Score: {finding.score}/10", ""]
    if finding.summary:
        lines += ["**Summary**", finding.summary, ""]
    if finding.strengths:
        lines += ["**Strengths**"]
        for s in finding.strengths:
            citation = (
                f" _(slide {', '.join(str(n) for n in s.slides_referenced)})_"
                if s.slides_referenced
                else ""
            )
            lines.append(f"- **{s.title}**{citation} — {s.detail}")
        lines.append("")
    if finding.gaps:
        lines += ["**Gaps & Recommendations**"]
        for g in finding.gaps:
            citation = (
                f" _(slide {', '.join(str(n) for n in g.slides_referenced)})_"
                if g.slides_referenced
                else ""
            )
            lines.append(
                f"- **[{g.severity.upper()}] {g.title}**{citation} — {g.detail} "
                f"_Recommendation:_ {g.recommendation}"
            )
        lines.append("")
    if finding.extra_recommendations:
        lines += ["**Other recommendations**"]
        for r in finding.extra_recommendations:
            lines.append(f"- {r}")
        lines.append("")
    return "\n".join(lines).strip()


def _build_structured_criterion_prompt(
    criterion: dict,
    doc_text: str,
    filename: str,
    metadata: dict | None = None,
) -> str:
    """Prompt that asks the model for a JSON StructuredFindingPayload.

    Schema enforcement is via Ollama's `format` parameter (set to
    StructuredFindingPayload.model_json_schema()) so the model can't
    drift from the shape — we don't repeat the field types here, only
    the *meaning* the model should put in each.
    """
    doc, note = _truncated_doc(doc_text)
    name = (criterion.get("name_en") or criterion.get("name") or "").strip()
    instr = (
        criterion.get("prompt_instruction_en") or criterion.get("prompt_instruction") or ""
    ).strip()

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
        f"# Source document\n"
        f"Filename: {filename}\n"
        f"Slide / page markers in the text below look like '## Slide 12' or '## Page 3'.\n"
        f"When you cite evidence, set `slides_referenced` to the integer slide / page numbers you took the evidence from.\n\n"
        f"```\n{doc}\n```{note}\n\n"
        f"{meta_block}"
        f"# Evaluation criterion\n## {name}\n{instr}\n\n"
        "# How to fill the JSON\n"
        "- `criterion_index`: leave as 0 — the server replaces it.\n"
        "- `criterion_name`: copy the criterion name above verbatim.\n"
        "- `score` (0–10): \n"
        "    9–10 excellent, 7–8 good, 5–6 adequate, 3–4 weak, 1–2 critical fail.\n"
        "- `verdict`: 'strong' if score≥7, 'adequate' if 5≤score<7, else 'weak'.\n"
        "- `summary`: ONE sentence on overall standing.\n"
        "- `strengths`: list of {title, detail, slides_referenced}. Each is a CONCRETE, VERIFIABLE claim from the document, not a marketing line. `title` is 3–8 words, `detail` is 1–2 sentences. Cite the slide(s) the evidence came from.\n"
        "- `gaps`: list of {title, detail, recommendation, severity, slides_referenced}. `severity` is 'high' (must fix to submit), 'medium' (notable issue), or 'low' (polish). `recommendation` is one imperative sentence: 'Add a KPI table on slide 8.'\n"
        "- `extra_recommendations`: bullets that don't tie to a specific gap.\n\n"
        "# Hard rules — read carefully\n"
        "1. EVERY strength and gap MUST cite at least one slide number in `slides_referenced` from the actual `## Slide N` markers above. If you cannot cite a slide, do not include the item.\n"
        "2. Quote or paraphrase ONLY content that appears in the document above. NEVER invent a section, claim, or number that you did not see.\n"
        "3. If you cannot find concrete evidence to evaluate this criterion (the document is short, missing the relevant section, or the content does not address the criterion), return:\n"
        "   - `score`: 0\n"
        "   - `verdict`: 'weak'\n"
        "   - `summary`: 'Insufficient evidence in the reviewed window to evaluate this criterion.'\n"
        "   - `strengths`: []\n"
        "   - `gaps`: []\n"
        "   - `extra_recommendations`: []\n"
        "4. Do NOT use `extra_recommendations` for fixes that belong to a specific gap. Every fix that ties to an observed problem goes inside that gap's `recommendation` field.\n"
        "5. If you cannot find any strengths, return `strengths: []`. Do NOT invent generic strengths just to fill the array. Same for `gaps`.\n"
        "6. The `score` you give MUST match the verdict band and the substance of the summary. A 'highly professional, comprehensive' summary cannot have score < 7.\n"
        "7. Each `slides_referenced` array MUST contain UNIQUE slide numbers in ascending order. Do NOT repeat the same slide number within one item's array — '[63, 63, 64]' is wrong; '[63, 64]' is right. The server will dedupe but a clean array is preferred."
    )


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
    "You extract structured metadata from consulting proposals. "
    "Output ONE JSON object with exactly these five string keys, in order: "
    'document_title, client_name, submission_date, purpose_and_scope, '
    "client_mandatory_requirements. "
    "No commentary, no markdown fences, no extra keys, no chat structure."
)

# A few-shot example anchors small models on the output schema; without it,
# 8B models on long inputs sometimes echo their own system prompt or get
# stuck in token loops. Keep the example tiny and visibly fake-but-shaped
# correctly so the model copies the shape, not the content.
_METADATA_EXAMPLE = (
    '{"document_title":"AI Strategy Roadmap",'
    '"client_name":"Ministry of Example",'
    '"submission_date":"2025-01-15",'
    '"purpose_and_scope":"24-week engagement to define an AI strategy.",'
    '"client_mandatory_requirements":"- Vision statement\\n- 3-year roadmap"}'
)

_METADATA_PROMPT_PREAMBLE = (
    "Extract metadata from the document below. Fields:\n"
    "- document_title: title of the proposal (usually on slide 1).\n"
    "- client_name: the target client (e.g. \"Ministry of Interior\").\n"
    "- submission_date: ISO YYYY-MM-DD if visible, else empty string.\n"
    "- purpose_and_scope: 1–2 sentence summary of the engagement.\n"
    "- client_mandatory_requirements: bulleted requirements as a single "
    "string with newlines between bullets.\n\n"
    "Use empty strings for fields you cannot find. Never invent values.\n\n"
    "Example output (illustrative shape only — do not copy values):\n"
    + _METADATA_EXAMPLE
    + "\n\nDocument:\n```\n"
)


def _build_metadata_prompt(doc_text: str) -> str:
    """Concatenate prompt parts so the JSON example's braces don't clash with
    Python's str.format() placeholder syntax (the previous template-with-format
    raised KeyError: '"document_title"' on the literal example braces)."""
    return (
        _METADATA_PROMPT_PREAMBLE
        + doc_text
        + "\n```\n\nNow output ONLY the JSON object for the document above."
    )


# How many characters of doc_text to send to the LLM for metadata extraction.
# Metadata (title, client, date, scope) sits in the first 1–3 slides of any
# real proposal. A larger window hurts: 8B models drift, lose the JSON
# instruction, and sometimes echo their system prompt as token-loop garbage.
METADATA_DOC_CHARS = 5000


def _slice_for_metadata(doc_text: str) -> str:
    """Return the first ~5K chars, snapped to a slide/page boundary if possible."""
    if len(doc_text) <= METADATA_DOC_CHARS:
        return doc_text
    cutoff = doc_text.rfind("\n## ", 0, METADATA_DOC_CHARS)
    if cutoff < 1000:  # too aggressive — keep at least 1K of context
        cutoff = METADATA_DOC_CHARS
    return doc_text[:cutoff]


_CLIENT_NAME_PATTERNS = (
    r"\bMinistry of [A-Z][A-Za-z &'-]+(?:, [A-Z][A-Za-z &'-]+)?",
    r"\bAuthority of [A-Z][A-Za-z &'-]+",
    r"\bDepartment of [A-Z][A-Za-z &'-]+",
    r"\bSaudi [A-Z][A-Za-z]+ (?:Authority|Commission|Center|Agency)",
    r"\b[A-Z][A-Za-z]+ (?:Authority|Commission|Council|Agency|Bank|Holding|Group)",
)


def _regex_metadata_baseline(doc_text: str, filename: str) -> dict:
    """Best-effort field extraction directly from doc_text — no LLM.

    Used as a baseline that always produces something useful (at minimum the
    filename as title), which is then *enriched* by the LLM. If the LLM
    fails completely, the baseline is what the user sees.
    """
    head = doc_text[:3000]  # first slide / cover page

    # Title: first non-empty line after "## Slide 1" / "## Page 1"; fallback
    # to the filename stem.
    title = ""
    m = re.search(r"##\s+(?:Slide|Page)\s+1\s*\n+(.+?)(?:\n|$)", doc_text)
    if m:
        title = m.group(1).strip()
    if not title:
        from pathlib import Path
        title = Path(filename or "").stem.replace("_", " ").strip()

    # Client: pattern-match common naming conventions on the cover slide.
    client = ""
    for pat in _CLIENT_NAME_PATTERNS:
        m = re.search(pat, head)
        if m:
            client = m.group(0).strip().rstrip(",.;:")
            break

    # Date: prefer ISO; fall back to "Month YYYY".
    date = ""
    m = re.search(r"\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b", head)
    if m:
        try:
            yyyy, mm, dd = m.group(1), int(m.group(2)), int(m.group(3))
            if 1 <= mm <= 12 and 1 <= dd <= 31:
                date = f"{yyyy}-{mm:02d}-{dd:02d}"
        except ValueError:
            pass

    return {
        "document_title": title,
        "client_name": client,
        "submission_date": date,
        "purpose_and_scope": "",
        "client_mandatory_requirements": "",
    }


def _merge_metadata(ai: dict, baseline: dict) -> dict:
    """Prefer a non-empty AI value; fall back to the baseline per field."""
    out = {}
    for k in baseline:
        v_ai = (ai.get(k) or "").strip() if isinstance(ai.get(k), str) else _safe_str(ai.get(k))
        out[k] = v_ai or baseline.get(k, "")
    return out


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
) -> tuple[dict, str, str]:
    """Parse file → ask LLM for structured metadata → return (metadata, text, kind).

    Returns:
        (metadata_dict, extracted_text, source_kind)

    Strategy: always compute a regex-based baseline from the document text
    (title from slide 1, client from cover-page patterns, ISO date if any).
    Then ask the LLM to enrich those fields. Whatever the model returns, we
    merge field-by-field — non-empty AI values win, baseline fills the gaps.
    If the LLM fails entirely (token loop, transport error, garbage JSON),
    the user still sees a usable starting set instead of an empty form.

    The extracted text and kind are returned alongside so callers (e.g. the
    upload page) can offer MD / JSON download derivatives without re-parsing.

    If `db` and `user` are provided, the user's preferred model + options
    are applied; otherwise system defaults are used.
    """
    doc_text, kind = file_parser_service.extract_text(filename, file_bytes)

    # Baseline always succeeds. Enrich with the LLM where we can.
    baseline = _regex_metadata_baseline(doc_text, filename)
    sliced = _slice_for_metadata(doc_text)
    prompt = _build_metadata_prompt(sliced)

    model = ollama_service.DEFAULT_MODEL
    options: dict = {}
    if db is not None and user is not None:
        pref = await llm_pref_service.get(db, user=user)
        if pref:
            if pref.model:
                model = pref.model
            options = dict(pref.options or {})

    # Anti-loop options: deterministic output, capped length, repeat penalty.
    # User-preference options still win — only fill in keys they didn't set.
    options = {
        "temperature": 0.0,
        "num_predict": 800,
        "repeat_penalty": 1.25,
        **options,
    }

    try:
        result = await ollama_service.generate(
            prompt,
            system=METADATA_SYSTEM,
            model=model,
            options=options,
            format="json",
        )
    except ollama_service.OllamaError:
        # Re-raise so the API endpoint surfaces a 502 — this is a real
        # operator-visible failure, not a metadata-quality issue.
        raise

    try:
        ai = _parse_metadata_json(result.output)
    except ValueError as e:
        logger.warning(
            "extract_metadata: LLM JSON unparseable, falling back to regex "
            "baseline (model=%s, doc_chars=%d, sliced=%d): %s",
            model, len(doc_text), len(sliced), e,
        )
        return baseline, doc_text, kind

    return _merge_metadata(ai, baseline), doc_text, kind


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

    # 1b. For .pptx, run the section splitter once. The result is reused
    # by every criterion's _assemble_criterion_text call so we only pay
    # the python-pptx cost once per review.
    # docx/pdf are not section-split yet (no canonical heading scheme),
    # so we set sections=None and those criteria silently fall back to
    # whole-proposal even if `evidence_source` is set. The coverage
    # chip will reflect this honestly.
    sections: ProposalSections | None = None
    if kind == "pptx":
        try:
            sections = split_pptx(file_bytes)
            logger.info(
                "streaming review: section_splitter found %d sections "
                "(%d expected canonical, %d unknown markers)",
                len(sections.sections),
                len(SECTION_KEYS) - len(sections.missing_sections),
                len(sections.unknown_markers),
            )
        except Exception as e:  # noqa: BLE001 — splitter is best-effort
            logger.warning(
                "streaming review: section_splitter failed (%s) — "
                "criteria with evidence_source will fall back to whole proposal", e,
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
            # Inactive criteria are hidden from the review flow entirely:
            # the operator deactivates them in the framework editor and
            # they neither appear in the streamed result nor consume a
            # model call.
            if c.get("active", True) is False:
                continue
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
    # `results` keeps the markdown output (for legacy export), `findings`
    # keeps the structured JSON the new UI renders from. Each criterion
    # contributes one entry to each.
    results: list[tuple[int, str, str, int]] = []  # (index, name, markdown, duration_ms)
    findings: list[dict] = []
    total_start = time.time()

    # Schema the LLM is held to — excludes `coverage` (server-computed).
    structured_schema = llm_finding_schema()

    for idx, criterion in enumerate(criteria_list):
        name = (criterion.get("name_en") or criterion.get("name") or "").strip()
        desc = (criterion.get("description_en") or criterion.get("description") or "").strip()

        yield {
            "event": "criterion_start",
            "data": {"index": idx, "name": name, "description": desc},
        }

        try:
            # Per-criterion document slice — honours the framework
            # editor's `evidence_source` selection. ["*"] = whole
            # proposal; otherwise concatenate the canonical sections
            # the operator picked. coverage reflects what THIS
            # criterion actually saw.
            evidence_source = _resolve_evidence_source(criterion)
            criterion_text, criterion_coverage, used_sections = _assemble_criterion_text(
                full_extracted_text=extracted_text,
                sections=sections,
                evidence_source=evidence_source,
            )
            logger.info(
                "criterion %d (%s) COVERAGE: evidence_source=%s used_sections=%s "
                "chars_sent=%d chars_total=%d slides_sent=%s..%s num_ctx=%s model=%s",
                idx, name, evidence_source, used_sections,
                criterion_coverage.chars_sent, criterion_coverage.chars_total,
                criterion_coverage.slides_sent_min, criterion_coverage.slides_sent_max,
                user_options.get("num_ctx", "<default>"), model_to_use,
            )

            structured_prompt = _build_structured_criterion_prompt(
                criterion, criterion_text, filename, metadata
            )
            # Ollama is held to the JSON schema; we round-trip through
            # Pydantic so any drift is caught at parse time.
            result = await ollama_service.generate(
                structured_prompt,
                system=system_prompt,
                model=model_to_use,
                options=user_options,
                format=structured_schema,
            )

            try:
                payload = StructuredFindingPayload.model_validate_json(result.output)
                finding = payload.finding
            except (ValidationError, ValueError) as e:
                # Fail-soft: log, emit error event, skip persistence for
                # this criterion. We don't retry inline because the
                # streaming flow shows one row per criterion in real time.
                logger.warning(
                    "criterion %d (%s) returned invalid structured output: %s",
                    idx, name, e,
                )
                yield {
                    "event": "criterion_error",
                    "data": {"index": idx, "name": name, "error": "invalid model output"},
                }
                continue

            # Server overrides — never trust client/model fields that
            # control identity or quality interpretation.
            finding.criterion_index = idx
            finding.criterion_name = name
            finding.verdict = verdict_from_score(finding.score)
            # Per-criterion coverage. When evidence_source narrowed
            # the input to specific sections, this reflects the
            # narrowed slide range. The coverage chip in the UI uses
            # this to flag citations outside the reviewed window.
            #
            # Decorate with what the LLM ACTUALLY consumed (#1-A): if
            # Ollama's prompt_eval_count is materially less than our
            # estimate-from-chars, the model's context window silently
            # truncated the prompt. Bilingual content runs ~3 chars
            # per token; we threshold at 70% to leave headroom for
            # tokenizer differences across models.
            criterion_coverage.tokens_consumed = result.prompt_eval_count
            if result.prompt_eval_count is not None and criterion_coverage.chars_sent > 0:
                expected_tokens = criterion_coverage.chars_sent / 3.0
                criterion_coverage.silent_truncation = (
                    result.prompt_eval_count < expected_tokens * 0.7
                )
                if criterion_coverage.silent_truncation:
                    logger.warning(
                        "criterion %d (%s): SILENT TRUNCATION — "
                        "sent ~%d est. tokens, model consumed %d "
                        "(%.0f%% of estimate)",
                        idx, name,
                        int(expected_tokens), result.prompt_eval_count,
                        100.0 * result.prompt_eval_count / max(expected_tokens, 1),
                    )
            finding.coverage = criterion_coverage

            # Server-side cross-check (#4-A): detect verdict-vs-summary
            # and score-vs-gaps contradictions. We do NOT auto-correct
            # the score — the human reviewer needs to see the warning.
            finding.consistency_warnings = detect_consistency_warnings(finding)
            if finding.consistency_warnings:
                logger.info(
                    "criterion %d (%s) consistency warnings: %s",
                    idx, name, finding.consistency_warnings,
                )

            findings.append(finding.model_dump(mode="json"))

            # Render the finding to Markdown for the legacy export path.
            markdown = _structured_to_markdown(finding)
            results.append((idx, name, markdown, result.duration_ms))

            yield {
                "event": "criterion_done",
                "data": {
                    "index": idx,
                    "name": name,
                    "status": finding.verdict,  # 'strong'|'adequate'|'weak'
                    "score": finding.score,
                    "markdown": f"## {idx + 1}. {name}\n\n{markdown}",
                    "finding": findings[-1],
                    "duration_ms": result.duration_ms,
                },
            }
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
            findings=findings,
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

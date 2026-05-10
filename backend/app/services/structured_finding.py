"""Structured per-criterion finding shape for the streaming review flow.

Replaces the regex-parsed Markdown output with a Pydantic-validated
JSON schema that the LLM is held to via Ollama's `format` parameter.

Persisted as a list of these on `proposal_reviews.findings` (JSONB,
added by V019). The legacy `review_output` Markdown column is still
written so existing exports keep working — see review_service for how
both are produced from the same call.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


# Quality verdict tied to the score band. The model is given the same
# bands in the prompt so it can self-label consistently. We DO NOT trust
# the model's chosen `verdict` blindly — review_service derives it from
# the score after the fact for safety.
Verdict = Literal["strong", "adequate", "weak"]


def _dedupe_slide_refs(v: list[int]) -> list[int]:
    """Pydantic validator helper: drop duplicate slide numbers and
    sort ascending. Models (especially small ones) sometimes emit the
    same slide twice in a single `slides_referenced` array — that
    visually pollutes the citation chips and conveys no extra info.

    Negative / zero / None entries are silently dropped — slide
    numbers are 1-indexed; non-positive values would only come from
    the model hallucinating.
    """
    if not v:
        return []
    out: list[int] = []
    seen: set[int] = set()
    for n in v:
        try:
            n_int = int(n)
        except (TypeError, ValueError):
            continue
        if n_int <= 0 or n_int in seen:
            continue
        seen.add(n_int)
        out.append(n_int)
    return sorted(out)


class StrengthItem(BaseModel):
    """One observed strength. `slides_referenced` carries slide numbers
    cited from the proposal — rendered as clickable chips by the UI."""

    title: str = Field("", max_length=200)
    detail: str = Field("", max_length=2000)
    slides_referenced: list[int] = Field(default_factory=list)

    @field_validator("slides_referenced")
    @classmethod
    def _slides_dedupe(cls, v: list[int]) -> list[int]:
        return _dedupe_slide_refs(v)


class GapItem(BaseModel):
    """One observed gap. `recommendation` is the proposed fix written
    as one short imperative sentence."""

    title: str = Field("", max_length=200)
    detail: str = Field("", max_length=2000)
    recommendation: str = Field("", max_length=1000)
    severity: Literal["high", "medium", "low"] = "medium"
    slides_referenced: list[int] = Field(default_factory=list)

    @field_validator("slides_referenced")
    @classmethod
    def _slides_dedupe(cls, v: list[int]) -> list[int]:
        return _dedupe_slide_refs(v)


class SourceCoverage(BaseModel):
    """How much of the source document the model actually saw when it
    produced this finding. Server-set (NOT trusted from the LLM) so the
    UI can show the operator what was reviewed vs cited, and flag
    citations that fall outside the reviewed window.

    `slides_total`: total slides / pages in the extracted document.
    `slides_sent_min/max`: inclusive 1-based slide range the model
        received. `None` for `slides_sent_max` means we couldn't
        confidently identify the boundary (e.g. the truncation cut
        mid-slide-marker).
    `char_cap_hit`: True when the document was longer than MAX_DOC_CHARS
        and we trimmed. The UI surfaces this as a warning chip.
    """

    slides_total: int = Field(ge=0, default=0)
    slides_sent_min: int = Field(ge=1, default=1)
    slides_sent_max: int | None = None
    chars_sent: int = Field(ge=0, default=0)
    chars_total: int = Field(ge=0, default=0)
    char_cap_hit: bool = False
    # Token count Ollama reports it actually consumed for the prompt.
    # Compared against an estimate-from-chars to detect silent
    # truncation by the model's context window — e.g. gemma4 (8K
    # context) silently chops a 70K-token prompt to fit. None when
    # the call hadn't happened yet at coverage-compute time (legacy
    # paths and the first-pass coverage before the LLM is called).
    tokens_consumed: int | None = None
    # True when tokens_consumed is materially less than estimated
    # tokens for chars_sent — the model's context window cut the
    # input. The UI surfaces this as a red badge on the coverage row.
    silent_truncation: bool = False


class StructuredFinding(BaseModel):
    """One criterion's full structured result. One row per criterion in
    the review run; persisted as `proposal_reviews.findings[*]`.

    Includes a `coverage` field that is server-computed from the
    extracted_text + truncation logic. The LLM is held to a NARROWER
    schema (StructuredFindingPayload below uses model_json_schema with
    coverage excluded — see review_service for the actual exclusion)
    so it never invents coverage values.
    """

    criterion_index: int = Field(ge=0)
    criterion_name: str = Field("", max_length=300)
    score: float = Field(ge=0, le=10)
    verdict: Verdict = "adequate"
    summary: str = Field("", max_length=1500)
    strengths: list[StrengthItem] = Field(default_factory=list)
    gaps: list[GapItem] = Field(default_factory=list)
    extra_recommendations: list[str] = Field(default_factory=list)
    coverage: SourceCoverage = Field(default_factory=SourceCoverage)
    # Server-set inconsistency warnings detected after the LLM
    # responded. We do NOT auto-correct the score — the human
    # reviewer needs to know the model was confused, not have the
    # output silently rewritten. Each entry is a short, plain-text
    # explanation. Empty list = no detected contradictions.
    consistency_warnings: list[str] = Field(default_factory=list)

    @field_validator("score")
    @classmethod
    def _round_score(cls, v: float) -> float:
        # The model occasionally returns 7.4999 or 8.50001; clamp the
        # noise without altering the user-visible value.
        return round(float(v), 1)


def llm_finding_schema() -> dict:
    """JSON Schema for what the LLM is constrained to produce — i.e.
    `StructuredFindingPayload` minus the server-set fields.

    Used by review_service when calling Ollama with `format=<schema>`.
    Stripping `coverage` here is intentional: if it stays in the
    schema, the model will fabricate slide numbers for `slides_sent_max`
    instead of leaving the default. We compute coverage server-side
    after the LLM call.
    """
    schema = StructuredFindingPayload.model_json_schema()
    # Drop the `coverage` definition + reference. Pydantic stores the
    # nested model under `$defs` and references it from `finding`'s
    # properties. Both must go.
    defs = schema.get("$defs") or schema.get("definitions") or {}
    finding_def = defs.get("StructuredFinding")
    if isinstance(finding_def, dict):
        props = finding_def.get("properties", {})
        props.pop("coverage", None)
        # Required list (if present) is harmless — coverage was optional
        # via default_factory, so it won't be there. Belt and suspenders:
        if isinstance(finding_def.get("required"), list):
            finding_def["required"] = [r for r in finding_def["required"] if r != "coverage"]
    defs.pop("SourceCoverage", None)
    return schema


class StructuredFindingPayload(BaseModel):
    """Wrapper that the LLM returns. Keeping the criterion meta in the
    response (instead of overlaying it server-side) lets us catch
    cross-talk: if `criterion_index` doesn't match what we asked for,
    the streaming runner logs a warning and discards."""

    finding: StructuredFinding


_POSITIVE_LANGUAGE = (
    "highly professional", "comprehensive", "well-structured", "well structured",
    "excellent", "robust", "exceptional", "outstanding", "best practice",
    "best-in-class", "strong", "thorough", "polished",
)
_NEGATIVE_LANGUAGE = (
    "poor", "weak", "lacking", "insufficient", "missing", "absent",
    "inadequate", "fails to", "does not address",
)


def detect_consistency_warnings(finding: "StructuredFinding") -> list[str]:
    """Server-side cross-check of the model's structured output.

    Detects the specific failure modes we saw on small models:
      1. Score in 'weak' band (<5) with a summary using positive
         language → model wrote a positive summary then picked an
         inconsistent score.
      2. Score in 'strong' band (≥7) with one or more high-severity
         gaps OR ≥3 gaps total → claim of strength contradicted by
         the listed gaps.
      3. Score in 'strong' band with summary using negative language.
      4. Empty strengths AND empty gaps with score ≠ 0 — model
         claimed a score without listing any evidence.

    These are SOFT signals: the warning surfaces to the human reviewer
    so they don't trust the score blindly. We do NOT auto-correct.
    """
    warnings: list[str] = []
    score = finding.score
    summary_lc = (finding.summary or "").lower()
    n_gaps_high = sum(1 for g in finding.gaps if g.severity == "high")
    n_gaps_total = len(finding.gaps)
    n_strengths = len(finding.strengths)

    if score < 5.0 and any(p in summary_lc for p in _POSITIVE_LANGUAGE):
        warnings.append(
            f"Score {score:.1f} (weak) but summary uses positive language. "
            "Verify whether the score reflects what was observed."
        )

    if score >= 7.0 and n_gaps_high > 0:
        warnings.append(
            f"Score {score:.1f} (strong) but {n_gaps_high} high-severity "
            "gap(s) listed. A high-severity gap usually means the criterion "
            "is NOT submission-ready — score may be inflated."
        )

    if score >= 7.0 and n_gaps_total >= 3:
        warnings.append(
            f"Score {score:.1f} (strong) but {n_gaps_total} gaps listed. "
            "Verify whether the score reflects the volume of gaps."
        )

    if score >= 7.0 and any(p in summary_lc for p in _NEGATIVE_LANGUAGE):
        warnings.append(
            f"Score {score:.1f} (strong) but summary uses negative "
            "language. Verify whether the score reflects the summary."
        )

    if score > 0 and n_strengths == 0 and n_gaps_total == 0:
        warnings.append(
            f"Score {score:.1f} but no strengths or gaps listed. The "
            "model gave a score without supporting evidence."
        )

    return warnings


def verdict_from_score(score: float | None) -> Verdict:
    """Score band → verdict label. Single source of truth so the UI
    chip and the persisted `verdict` agree."""
    if score is None:
        return "weak"
    if score >= 7.0:
        return "strong"
    if score >= 5.0:
        return "adequate"
    return "weak"

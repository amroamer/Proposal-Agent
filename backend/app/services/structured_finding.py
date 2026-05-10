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


class StrengthItem(BaseModel):
    """One observed strength. `slides_referenced` carries slide numbers
    cited from the proposal — rendered as clickable chips by the UI."""

    title: str = Field("", max_length=200)
    detail: str = Field("", max_length=2000)
    slides_referenced: list[int] = Field(default_factory=list)


class GapItem(BaseModel):
    """One observed gap. `recommendation` is the proposed fix written
    as one short imperative sentence."""

    title: str = Field("", max_length=200)
    detail: str = Field("", max_length=2000)
    recommendation: str = Field("", max_length=1000)
    severity: Literal["high", "medium", "low"] = "medium"
    slides_referenced: list[int] = Field(default_factory=list)


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

"""Phase 2 — per-section facts-sheet Pydantic schemas.

The dossier is the cached, structured representation of the proposal that
Phase 4 routes against. Each canonical section has its own Pydantic model
describing the SHAPE of facts the LLM should extract, expressed compactly
(< 12 fields per model). Schemas are converted to JSON Schema via
`model_json_schema()` and passed to Ollama's `format` parameter — model
output is then validated by Pydantic. NO regex-parsing of model output
anywhere downstream.

Design rules:
  - No translation: facts are stored in their source language. Mixed
    AR/EN is fine — the criterion runner picks the right field at
    evaluation time.
  - All free-form lists default to [] so partial extractions still
    validate.
  - All scalar facts that the model may not be able to find are typed
    `<T> | None` and default to None so empty fields are explicit.
  - Field names are stable: persisted dossier rows are keyed off them.

These models are also re-used as the per-section LLM `format` schema —
each section's extraction call passes the model's JSON schema and the
section's text and gets back a row that validates cleanly.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .section_mapping import SECTION_KEYS


# ---------- shared sub-models -------------------------------------------------


class TeamMember(BaseModel):
    name: str
    role: str
    years_experience: int | None = None
    certifications: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    bio_summary: str = ""


class ExperienceProject(BaseModel):
    name: str
    client: str = ""
    sector: str = ""
    year: int | None = None
    scope_summary: str = ""
    deliverables: list[str] = Field(default_factory=list)


class ApproachPhase(BaseModel):
    name: str
    duration_weeks: int | None = None
    activities: list[str] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)


# ---------- per-section facts -------------------------------------------------


class GenericNarrativeFacts(BaseModel):
    """Catch-all for narrative sections (understanding / value /
    perspective / executive_summary). Captures the claim graph without
    over-specifying structure the model may not find."""

    key_claims: list[str] = Field(default_factory=list)
    supporting_evidence: list[str] = Field(default_factory=list)
    gaps_or_assumptions: list[str] = Field(default_factory=list)


class TeamStructureFacts(BaseModel):
    members: list[TeamMember] = Field(default_factory=list)


class DetailedExperienceFacts(BaseModel):
    projects: list[ExperienceProject] = Field(default_factory=list)


class DetailedApproachFacts(BaseModel):
    phases: list[ApproachPhase] = Field(default_factory=list)
    total_duration_weeks: int | None = None
    methodology_name: str | None = None


class ToolsMethodologiesFacts(BaseModel):
    tools: list[str] = Field(default_factory=list)
    methodologies: list[str] = Field(default_factory=list)
    standards_referenced: list[str] = Field(default_factory=list)


class CertificationsFacts(BaseModel):
    certifications: list[str] = Field(default_factory=list)
    accreditations: list[str] = Field(default_factory=list)
    expiry_dates: list[str] = Field(default_factory=list)


class TermsFacts(BaseModel):
    payment_terms: list[str] = Field(default_factory=list)
    liability_clauses: list[str] = Field(default_factory=list)
    confidentiality_clauses: list[str] = Field(default_factory=list)
    other_terms: list[str] = Field(default_factory=list)


class AssumptionsFacts(BaseModel):
    assumptions: list[str] = Field(default_factory=list)
    exclusions: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class EvaluationCriteriaFacts(BaseModel):
    """Section 01 in the deck: how the CLIENT will score the proposal.
    Captured separately so the framework runner can cross-check coverage."""

    criteria: list[str] = Field(default_factory=list)
    weights: list[str] = Field(default_factory=list)
    scoring_method: str | None = None


class KpmgProfileFacts(GenericNarrativeFacts):
    """Same shape as a narrative section — KPMG profile is a marketing
    chapter; its 'claims' are about KPMG's footprint and credentials."""


# Mapping: canonical section_key -> Pydantic model used for its facts
SECTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "evaluation_criteria":  EvaluationCriteriaFacts,
    "executive_summary":    GenericNarrativeFacts,
    "our_understanding":    GenericNarrativeFacts,
    "value_proposition":    GenericNarrativeFacts,
    "our_perspective":      GenericNarrativeFacts,
    "detailed_approach":    DetailedApproachFacts,
    "team_structure":       TeamStructureFacts,
    "detailed_experience":  DetailedExperienceFacts,
    "tools_methodologies":  ToolsMethodologiesFacts,
    "kpmg_profile":         KpmgProfileFacts,
    "certifications":       CertificationsFacts,
    "terms":                TermsFacts,
    "assumptions":          AssumptionsFacts,
}

# Cross-check at import time: every canonical key has a schema. If a key
# is added to section_mapping.SECTION_KEYS but not here, fail loudly.
_missing = set(SECTION_KEYS) - set(SECTION_SCHEMAS)
if _missing:  # pragma: no cover — guard against silent drift
    raise RuntimeError(
        f"dossier_schemas.SECTION_SCHEMAS missing keys: {sorted(_missing)}"
    )


def schema_for(section_key: str) -> type[BaseModel] | None:
    """Return the Pydantic model used for `section_key`, or None if the
    key is unknown (e.g. front_matter — extraction is skipped)."""
    return SECTION_SCHEMAS.get(section_key)


# ---------- top-level dossier -------------------------------------------------


class Dossier(BaseModel):
    """Top-level cached representation of one proposal's facts.

    `sections` is a free-form dict because we can't statically type a
    union-of-models keyed by string. We validate per-section by looking
    up the right model from SECTION_SCHEMAS at write time (in the
    extractor) and at read time (in the criterion runner).
    """

    model_config = ConfigDict(extra="forbid")

    proposal_id: int
    source_hash: str = Field(min_length=64, max_length=64)  # sha256 hex
    extracted_at: datetime
    model: str
    # Each value is a JSON-serialisable dict that round-trips through
    # the section's specific Pydantic model. Stored as `dict[str, dict]`
    # so the whole dossier serialises cleanly to a single JSONB column.
    sections: dict[str, dict] = Field(default_factory=dict)
    # Slides referenced per section — preserved so the criterion runner
    # can cite specific slide ranges when summarising evidence.
    section_starts: dict[str, int] = Field(default_factory=dict)


def validate_section_payload(section_key: str, payload: dict) -> dict:
    """Round-trip `payload` through the section's Pydantic model.

    Used by the extractor: model returns a dict, we validate it against
    SECTION_SCHEMAS[section_key], then store the validated dict (after
    Pydantic has filled defaults and coerced types).

    Raises ValueError (Pydantic ValidationError -> ValueError) when the
    payload doesn't match the schema. Caller is expected to retry once
    on failure and then store {} on the second failure.
    """
    model_cls = SECTION_SCHEMAS.get(section_key)
    if model_cls is None:
        raise ValueError(f"No schema registered for section {section_key!r}")
    instance = model_cls.model_validate(payload)
    return instance.model_dump(mode="json")

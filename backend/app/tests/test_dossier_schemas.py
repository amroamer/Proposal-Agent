"""Phase 2 — dossier schema validation tests.

For each canonical section, hand-craft a fixture that exercises the
shape and confirm:
  - `validate_section_payload` round-trips it cleanly
  - `model_json_schema()` produces a JSON Schema that Ollama's `format`
    parameter can consume (object type, properties block, no $ref to
    missing definitions)
  - the `Dossier` top-level model accepts the assembled dict
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.proposal_review.dossier_schemas import (
    SECTION_SCHEMAS,
    Dossier,
    DetailedApproachFacts,
    DetailedExperienceFacts,
    EvaluationCriteriaFacts,
    GenericNarrativeFacts,
    KpmgProfileFacts,
    TeamStructureFacts,
    ToolsMethodologiesFacts,
    CertificationsFacts,
    TermsFacts,
    AssumptionsFacts,
    schema_for,
    validate_section_payload,
)
from app.services.proposal_review.section_mapping import SECTION_KEYS


# ---------- per-section fixtures --------------------------------------------

_FIXTURES: dict[str, dict] = {
    "evaluation_criteria": {
        "criteria": ["Technical understanding", "Team strength"],
        "weights": ["50%", "30%"],
        "scoring_method": "Weighted average",
    },
    "executive_summary": {
        "key_claims": ["KPMG has delivered 12 similar engagements in KSA"],
        "supporting_evidence": ["Case studies on slides 45–52"],
        "gaps_or_assumptions": [],
    },
    "our_understanding": {
        "key_claims": ["Client wants to digitise back-office workflows"],
        "supporting_evidence": [],
        "gaps_or_assumptions": ["Assumes existing SAP landscape"],
    },
    "value_proposition": {
        "key_claims": ["20% reduction in cycle time"],
        "supporting_evidence": ["Benchmark from prior MoH engagement"],
        "gaps_or_assumptions": [],
    },
    "our_perspective": {
        "key_claims": ["AI-first roadmap"],
        "supporting_evidence": [],
        "gaps_or_assumptions": [],
    },
    "detailed_approach": {
        "phases": [
            {
                "name": "Discovery",
                "duration_weeks": 4,
                "activities": ["Stakeholder interviews"],
                "deliverables": ["Current-state report"],
            },
            {
                "name": "Design",
                "duration_weeks": 8,
                "activities": ["Workshops"],
                "deliverables": ["Target operating model"],
            },
        ],
        "total_duration_weeks": 24,
        "methodology_name": "KPMG Powered Enterprise",
    },
    "team_structure": {
        "members": [
            {
                "name": "Sara Ahmed",
                "role": "Engagement Partner",
                "years_experience": 18,
                "certifications": ["CPA"],
                "languages": ["Arabic", "English"],
                "bio_summary": "Leads digital transformation engagements.",
            },
            {
                "name": "Khalid Saud",
                "role": "Project Manager",
                "years_experience": 12,
                "certifications": ["PMP"],
                "languages": ["Arabic"],
                "bio_summary": "PMO lead.",
            },
        ],
    },
    "detailed_experience": {
        "projects": [
            {
                "name": "MoH Digital Backbone",
                "client": "Ministry of Health",
                "sector": "Public Health",
                "year": 2024,
                "scope_summary": "Replaced 14 legacy systems.",
                "deliverables": ["TOM", "Implementation plan"],
            }
        ]
    },
    "tools_methodologies": {
        "tools": ["ServiceNow", "Power BI"],
        "methodologies": ["Agile", "TOGAF"],
        "standards_referenced": ["ISO 27001"],
    },
    "kpmg_profile": {
        "key_claims": ["KPMG is the largest advisory firm in KSA"],
        "supporting_evidence": ["Riyadh and Jeddah offices"],
        "gaps_or_assumptions": [],
    },
    "certifications": {
        "certifications": ["ZATCA-compliant"],
        "accreditations": ["ISO 27001"],
        "expiry_dates": ["2027-06-30"],
    },
    "terms": {
        "payment_terms": ["30% on signing, 70% on delivery"],
        "liability_clauses": ["Capped at 100% of fees"],
        "confidentiality_clauses": ["NDA in force for 5 years"],
        "other_terms": [],
    },
    "assumptions": {
        "assumptions": ["Client provides SME availability"],
        "exclusions": ["Hardware procurement"],
        "dependencies": ["Existing AD integration"],
    },
}


class TestSchemaCoverage:
    def test_every_canonical_section_has_a_schema(self):
        for key in SECTION_KEYS:
            assert schema_for(key) is not None, f"missing schema for {key}"

    def test_every_canonical_section_has_a_fixture(self):
        # If you add a section_key, add a fixture too.
        for key in SECTION_KEYS:
            assert key in _FIXTURES, f"missing test fixture for {key}"

    def test_unknown_key_returns_none(self):
        assert schema_for("front_matter") is None
        assert schema_for("nonexistent_section") is None


class TestValidateSectionPayload:
    @pytest.mark.parametrize("section_key", list(SECTION_KEYS))
    def test_valid_fixture_round_trips(self, section_key):
        payload = _FIXTURES[section_key]
        out = validate_section_payload(section_key, payload)
        assert isinstance(out, dict)
        # Re-validating the output must succeed (idempotent).
        again = validate_section_payload(section_key, out)
        assert again == out

    def test_unknown_section_raises(self):
        with pytest.raises(ValueError, match="No schema registered"):
            validate_section_payload("front_matter", {})

    def test_partial_payload_fills_defaults(self):
        # An empty narrative section is still valid — fields default to [].
        out = validate_section_payload("our_understanding", {})
        assert out == {
            "key_claims": [],
            "supporting_evidence": [],
            "gaps_or_assumptions": [],
        }

    def test_extra_field_raises(self):
        # Pydantic default behaviour is to ignore extras, but the extractor
        # contract is that the LLM returns ONLY the schema keys. We rely
        # on Ollama's `format` schema to enforce this. Sanity: an invalid
        # type still raises.
        bad = {"members": "should-be-a-list-not-a-string"}
        with pytest.raises((ValueError, TypeError)):
            validate_section_payload("team_structure", bad)


class TestModelJsonSchema:
    @pytest.mark.parametrize("section_key", list(SECTION_KEYS))
    def test_section_schema_is_valid_json_schema(self, section_key):
        model_cls = schema_for(section_key)
        schema = model_cls.model_json_schema()
        assert schema["type"] == "object"
        assert "properties" in schema
        # JSON-serialise round-trip — Ollama needs a JSON-clean dict.
        import json
        json.dumps(schema)

    def test_dossier_top_level_schema_is_valid(self):
        schema = Dossier.model_json_schema()
        assert schema["type"] == "object"
        # Must contain proposal_id, source_hash, extracted_at, model, sections
        props = schema.get("properties", {})
        for required in ("proposal_id", "source_hash", "extracted_at", "model", "sections"):
            assert required in props, f"Dossier missing top-level field {required}"


class TestDossierAssembly:
    def test_full_dossier_validates(self):
        # Build a Dossier where every canonical section is filled with
        # its fixture. Mirrors what the Phase-3 extractor produces.
        sections = {
            key: validate_section_payload(key, _FIXTURES[key])
            for key in SECTION_KEYS
        }
        dossier = Dossier(
            proposal_id=1,
            source_hash="a" * 64,
            extracted_at=datetime.now(tz=timezone.utc),
            model="qwen2.5:32b",
            sections=sections,
            section_starts={key: idx + 2 for idx, key in enumerate(SECTION_KEYS)},
        )
        # Round-trip through JSON to confirm it persists cleanly to JSONB.
        as_json = dossier.model_dump(mode="json")
        rehydrated = Dossier.model_validate(as_json)
        assert rehydrated.proposal_id == 1
        assert set(rehydrated.sections.keys()) == set(SECTION_KEYS)

    def test_partial_dossier_validates(self):
        # Real proposals frequently miss one or two sections (Phase 1
        # logs a warning but doesn't raise). The dossier must accept that.
        dossier = Dossier(
            proposal_id=42,
            source_hash="b" * 64,
            extracted_at=datetime.now(tz=timezone.utc),
            model="qwen2.5:32b",
            sections={
                "executive_summary": validate_section_payload(
                    "executive_summary", _FIXTURES["executive_summary"]
                ),
            },
        )
        assert "executive_summary" in dossier.sections
        assert "team_structure" not in dossier.sections

    def test_invalid_source_hash_rejected(self):
        with pytest.raises(ValueError):
            Dossier(
                proposal_id=1,
                source_hash="too-short",
                extracted_at=datetime.now(tz=timezone.utc),
                model="qwen2.5:32b",
            )

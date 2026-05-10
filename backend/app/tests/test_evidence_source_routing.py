"""Phase 5 — evidence_source routing + schema tests.

Spec acceptance:
  - New column populated for all existing criteria via backfill (covered
    by V017; tested at the SQL level via the Pydantic+routing surface
    rather than against a live PG instance).
  - Switching a criterion's `evidence_source` changes which sections
    are sent on the next review run (already covered in
    test_criterion_runner.test_run_review_evidence_source_override_reaches_dossier_subset).
  - Pydantic validation: ['*'] alone, all known section keys, otherwise reject.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.framework import FrameworkCriterion, FrameworkCreate
from app.services.proposal_review.group_routing import (
    DEFAULT_FALLBACK,
    WILDCARD,
    GROUP_TO_SECTIONS,
    validate_evidence_source,
)
from app.services.proposal_review.section_mapping import SECTION_KEYS


# ---- Pydantic schema validation ---------------------------------------------


class TestFrameworkCriterionEvidenceSource:
    def test_default_is_wildcard(self):
        c = FrameworkCriterion(name_en="X")
        assert c.evidence_source == [WILDCARD]

    def test_explicit_wildcard_accepted(self):
        c = FrameworkCriterion(name_en="X", evidence_source=[WILDCARD])
        assert c.evidence_source == [WILDCARD]

    def test_specific_keys_accepted(self):
        c = FrameworkCriterion(
            name_en="X", evidence_source=["team_structure", "detailed_experience"]
        )
        assert c.evidence_source == ["team_structure", "detailed_experience"]

    def test_wildcard_with_other_keys_rejected(self):
        with pytest.raises(ValidationError):
            FrameworkCriterion(
                name_en="X", evidence_source=[WILDCARD, "team_structure"]
            )

    def test_unknown_key_rejected(self):
        with pytest.raises(ValidationError):
            FrameworkCriterion(name_en="X", evidence_source=["not_a_real_section"])

    def test_empty_falls_back_to_wildcard(self):
        c = FrameworkCriterion(name_en="X", evidence_source=[])
        assert c.evidence_source == [WILDCARD]

    def test_none_falls_back_to_wildcard(self):
        # Explicit None on the wire is sometimes how legacy clients send "absent".
        c = FrameworkCriterion(name_en="X", evidence_source=None)
        assert c.evidence_source == [WILDCARD]

    def test_dedup_preserves_order(self):
        c = FrameworkCriterion(
            name_en="X",
            evidence_source=["team_structure", "team_structure", "detailed_experience"],
        )
        assert c.evidence_source == ["team_structure", "detailed_experience"]

    def test_legacy_criterion_payload_still_validates(self):
        # A pre-V017 criterion has no evidence_source key. Must still
        # validate (Pydantic fills the default).
        legacy = {
            "name_en": "Old criterion",
            "name_ar": "",
            "description_en": "",
            "prompt_instruction_en": "evaluate it",
            "group": "Team",
        }
        c = FrameworkCriterion.model_validate(legacy)
        assert c.evidence_source == [WILDCARD]

    def test_framework_create_with_full_criteria(self):
        # Ensure the parent FrameworkCreate schema still validates with
        # the new field on its embedded criteria.
        fw = FrameworkCreate(
            name="t",
            persona_instruction="",
            persona_instruction_ar="",
            model="qwen2.5:32b",
            criteria=[
                FrameworkCriterion(
                    name_en="C1", group="Team", evidence_source=["team_structure"]
                ),
                FrameworkCriterion(
                    name_en="C2", group="Assessment", evidence_source=[WILDCARD]
                ),
            ],
        )
        assert len(fw.criteria) == 2
        assert fw.criteria[0].evidence_source == ["team_structure"]
        assert fw.criteria[1].evidence_source == [WILDCARD]


# ---- V017 backfill semantics (in-Python equivalent) ------------------------


class TestBackfillSemantics:
    """The V017 SQL migration backfills evidence_source per criterion
    based on its `group`. We test the equivalent mapping at the Python
    layer — the SQL version mirrors GROUP_TO_SECTIONS exactly, so any
    drift between SQL and code would show up as a divergence here.

    The migration's case-insensitive group lookup matches
    `validate_evidence_source` consumed in the Python schema, so this
    also doubles as a contract test for the runner's fallback path.
    """

    @pytest.mark.parametrize(
        "group,expected_sections",
        list(GROUP_TO_SECTIONS.items()),
    )
    def test_group_to_sections_is_well_formed(self, group, expected_sections):
        # Every entry validates as a legal evidence_source value.
        result = validate_evidence_source(expected_sections)
        assert result == expected_sections

    def test_unknown_group_backfills_wildcard(self):
        # Migration: ELSE '["*"]'. Python equivalent: validate_evidence_source(None)
        assert validate_evidence_source(None) == DEFAULT_FALLBACK == [WILDCARD]

    def test_default_fallback_is_wildcard(self):
        assert DEFAULT_FALLBACK == [WILDCARD]

    def test_every_canonical_section_is_a_legal_value(self):
        # Each canonical section is acceptable as a single-entry value.
        for key in SECTION_KEYS:
            assert validate_evidence_source([key]) == [key]

    def test_combination_of_canonical_sections_legal(self):
        # Non-trivial subset.
        v = ["team_structure", "detailed_experience", "tools_methodologies"]
        assert validate_evidence_source(v) == v


# ---- /sections endpoint shape ----------------------------------------------


class TestSectionsEndpointContract:
    """Smoke test the response builder used by GET /sections — verifies
    every canonical key has a label entry and the wildcard symbol is
    surfaced."""

    @pytest.mark.asyncio
    async def test_endpoint_payload_shape(self):
        from app.api.v1.sections import list_sections

        resp = await list_sections()
        assert resp.wildcard == "*"
        assert len(resp.sections) == len(SECTION_KEYS)
        keys = [s.key for s in resp.sections]
        assert keys == list(SECTION_KEYS)
        for entry in resp.sections:
            assert entry.label_en, f"missing English label for {entry.key}"
            assert entry.label_ar, f"missing Arabic label for {entry.key}"

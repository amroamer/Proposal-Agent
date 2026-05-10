"""Tests for the criterion `active` flag.

Coverage:
  - Pydantic schema: defaults to True; round-trips True/False; legacy
    payloads without the key still validate.
  - criterion_runner.run_review skips inactive criteria — the LLM is
    never called for them and no row is persisted.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from app.models.dossier import Dossier as DossierRow
from app.schemas.framework import FrameworkCriterion
from app.services.proposal_review.criterion_runner import (
    CriterionEvaluation,
    CriterionEvaluationBatch,
    run_review,
)
from app.services.proposal_review.llm_client import (
    Classification,
    StructuredResult,
)


# ---- Pydantic ---------------------------------------------------------------


class TestActiveFlagPydantic:
    def test_default_is_active_true(self):
        c = FrameworkCriterion(name_en="X")
        assert c.active is True

    def test_explicit_false_round_trips(self):
        c = FrameworkCriterion(name_en="X", active=False)
        assert c.active is False
        # Re-validate the dumped payload.
        c2 = FrameworkCriterion.model_validate(c.model_dump())
        assert c2.active is False

    def test_explicit_true_round_trips(self):
        c = FrameworkCriterion(name_en="X", active=True)
        assert c.active is True

    def test_legacy_payload_without_active_defaults_true(self):
        # Pre-V018 stored criteria have no `active` key.
        legacy = {
            "name_en": "Old criterion",
            "prompt_instruction_en": "evaluate",
            "group": "Team",
        }
        c = FrameworkCriterion.model_validate(legacy)
        assert c.active is True


# ---- runner skips inactive --------------------------------------------------


def _dossier_json() -> dict:
    """Minimal dossier with the sections referenced by the test groups."""
    return {
        "proposal_id": 1,
        "source_hash": "a" * 64,
        "extracted_at": "2026-01-01T00:00:00+00:00",
        "model": "qwen2.5:32b",
        "sections": {
            "team_structure": {"members": []},
            "detailed_experience": {"projects": []},
        },
        "section_starts": {"team_structure": 2, "detailed_experience": 8},
    }


def _make_framework(criteria: list[dict]):
    from app.models.review_framework import ReviewFramework

    fw = ReviewFramework()
    fw.id = 100
    fw.name = "T"
    fw.persona_instruction = ""
    fw.persona_instruction_ar = ""
    fw.model = "qwen2.5:32b"
    fw.criteria = criteria
    return fw


def _mock_db(*, dossier_row: DossierRow) -> MagicMock:
    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    cache_result = MagicMock()
    cache_result.scalar_one_or_none = MagicMock(return_value=dossier_row)
    db.execute = AsyncMock(return_value=cache_result)
    return db


def _ev(cid: str) -> CriterionEvaluation:
    return CriterionEvaluation(
        criterion_id=cid, score=4, score_label="green",
        evidence="ok", gaps=[], slides_referenced=[], language_used="ar",
    )


@pytest.mark.asyncio
async def test_inactive_criteria_are_skipped_no_llm_call_no_row():
    dossier = MagicMock(spec=DossierRow)
    dossier.dossier_json = _dossier_json()
    db = _mock_db(dossier_row=dossier)

    criteria = [
        {"group": "Team",       "criterion_id": "c1", "name_en": "Active one",   "active": True},
        {"group": "Team",       "criterion_id": "c2", "name_en": "Disabled one", "active": False},
        {"group": "Experience", "criterion_id": "c3", "name_en": "Default-active"},  # no key -> active
    ]
    fw = _make_framework(criteria)

    seen_criterion_ids: list[set[str]] = []

    async def _mock_generate(*, schema: type[BaseModel], prompt: str, **_):
        # Capture which criterion_ids appear in each prompt — c2 must
        # NEVER be present because it's inactive.
        ids_in_prompt = {
            cid for cid in ("c1", "c2", "c3")
            if f"criterion_id: {cid}" in prompt
        }
        seen_criterion_ids.append(ids_in_prompt)
        # Return one evaluation per active criterion in this group.
        return StructuredResult(
            parsed=CriterionEvaluationBatch(
                evaluations=[_ev(cid) for cid in ids_in_prompt]
            ),
            raw_output="{}",
            model="qwen2.5:32b",
            duration_ms=1,
        )

    with patch(
        "app.services.proposal_review.criterion_runner.generate_structured",
        side_effect=_mock_generate,
    ) as gs:
        rows = await run_review(
            db, proposal_id=1, framework=fw,
            classification=Classification.RESTRICTED,
        )

    # Inactive c2 must NOT appear in any prompt.
    flat_ids = set().union(*seen_criterion_ids)
    assert "c1" in flat_ids
    assert "c3" in flat_ids
    assert "c2" not in flat_ids

    # Two distinct active groups -> exactly two LLM calls.
    assert gs.await_count == 2

    # Two persisted rows (one per active criterion).
    assert len(rows) == 2
    assert {r.criterion_id for r in rows} == {"c1", "c3"}


# ---- legacy review_service surfaces ----------------------------------------


class TestLegacyReviewServiceFiltersInactive:
    """The legacy single-blob review pipeline (review_service.py) and the
    per-criterion streaming pipeline both build prompts from
    `framework.criteria`. Inactive criteria must be filtered out at all
    those build sites — otherwise the model still gets asked to evaluate
    a criterion the user deactivated.
    """

    def _fw_with_mixed_active(self):
        from app.models.review_framework import ReviewFramework
        fw = ReviewFramework()
        fw.id = 1
        fw.name = "T"
        fw.persona_instruction = ""
        fw.persona_instruction_ar = ""
        fw.model = "qwen2.5:32b"
        fw.criteria = [
            {"name_en": "Active criterion",   "prompt_instruction_en": "do A", "active": True},
            {"name_en": "Disabled criterion", "prompt_instruction_en": "do B", "active": False},
            {"name_en": "Legacy criterion",   "prompt_instruction_en": "do C"},  # active default = True
        ]
        return fw

    def test_build_framework_prompt_excludes_inactive(self):
        from app.services.review_service import _build_framework_prompt
        fw = self._fw_with_mixed_active()
        prompt = _build_framework_prompt(fw, "doc text", "deck.pptx")
        assert "Active criterion" in prompt
        assert "Legacy criterion" in prompt
        assert "Disabled criterion" not in prompt
        assert "do B" not in prompt

    def test_build_multiframework_prompt_excludes_inactive(self):
        from app.services.review_service import _build_multiframework_prompt
        fw = self._fw_with_mixed_active()
        _, user_prompt, _ = _build_multiframework_prompt(
            [fw], disabled=set(), doc_text="doc", filename="deck.pptx"
        )
        assert "Active criterion" in user_prompt
        assert "Legacy criterion" in user_prompt
        assert "Disabled criterion" not in user_prompt
        assert "do B" not in user_prompt


@pytest.mark.asyncio
async def test_all_inactive_means_zero_calls_zero_rows():
    dossier = MagicMock(spec=DossierRow)
    dossier.dossier_json = _dossier_json()
    db = _mock_db(dossier_row=dossier)

    criteria = [
        {"group": "Team",       "criterion_id": "c1", "name_en": "x", "active": False},
        {"group": "Experience", "criterion_id": "c2", "name_en": "y", "active": False},
    ]
    fw = _make_framework(criteria)

    with patch(
        "app.services.proposal_review.criterion_runner.generate_structured",
        side_effect=AsyncMock(),
    ) as gs:
        rows = await run_review(
            db, proposal_id=1, framework=fw,
            classification=Classification.RESTRICTED,
        )

    assert gs.await_count == 0, "no active criteria => no LLM calls"
    assert rows == []

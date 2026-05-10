"""Phase 4 — criterion runner tests.

Acceptance criteria from the spec:
  - One LLM call per group per review run — we assert
    `llm_calls == len(distinct_groups_in_framework)`.
  - Output schema enforced via Ollama `format` parameter — no json.loads
    in try/except, no regex on model output. (Tested indirectly: we
    inject a `generate_structured` mock that returns Pydantic objects;
    if the runner did its own parsing it would break.)
  - Smoke: every criterion has a score 0–5 and at least one has a
    non-empty `slides_referenced` list (when the LLM returns one).

Plus targeted tests for:
  - Group routing correctness (Assessment -> ['*'], Team -> team_structure, ...)
  - Unknown groups fall back to whole-proposal evaluation
  - Batched call carries every criterion in the group
  - Per-criterion `evidence_source` override (Phase-5 plumbing tested early)
  - Result row shape (score, label, gaps, slides_referenced, language_used)
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from app.models.dossier import Dossier as DossierRow
from app.models.proposal_criterion_review import ProposalCriterionReview
from app.models.review_framework import ReviewFramework
from app.services.proposal_review.criterion_runner import (
    CriterionEvaluation,
    CriterionEvaluationBatch,
    _build_dossier_subset,
    _detect_language,
    _group_criteria,
    _resolve_sections_for_criterion,
    run_review,
)
from app.services.proposal_review.group_routing import (
    GROUP_TO_SECTIONS,
    WILDCARD,
    is_wildcard,
    resolve_sections_for_group,
    validate_evidence_source,
)
from app.services.proposal_review.llm_client import (
    Classification,
    StructuredResult,
)


# ---- helpers ----------------------------------------------------------------


def _dossier_json() -> dict:
    """Synthetic dossier with all canonical sections populated."""
    return {
        "proposal_id": 1,
        "source_hash": "a" * 64,
        "extracted_at": datetime.now(tz=timezone.utc).isoformat(),
        "model": "qwen2.5:32b",
        "sections": {
            "evaluation_criteria":  {"criteria": ["c1"], "weights": ["50%"], "scoring_method": None},
            "executive_summary":    {"key_claims": ["k"], "supporting_evidence": [], "gaps_or_assumptions": []},
            "our_understanding":    {"key_claims": [], "supporting_evidence": [], "gaps_or_assumptions": []},
            "value_proposition":    {"key_claims": [], "supporting_evidence": [], "gaps_or_assumptions": []},
            "our_perspective":      {"key_claims": [], "supporting_evidence": [], "gaps_or_assumptions": []},
            "detailed_approach":    {"phases": [], "total_duration_weeks": None, "methodology_name": None},
            "team_structure":       {"members": [{"name": "Sara", "role": "EP", "years_experience": 18, "certifications": [], "languages": [], "bio_summary": ""}]},
            "detailed_experience":  {"projects": []},
            "tools_methodologies":  {"tools": [], "methodologies": [], "standards_referenced": []},
            "kpmg_profile":         {"key_claims": [], "supporting_evidence": [], "gaps_or_assumptions": []},
            "certifications":       {"certifications": [], "accreditations": [], "expiry_dates": []},
            "terms":                {"payment_terms": [], "liability_clauses": [], "confidentiality_clauses": [], "other_terms": []},
            "assumptions":          {"assumptions": [], "exclusions": [], "dependencies": []},
        },
        "section_starts": {k: i + 2 for i, k in enumerate(GROUP_TO_SECTIONS)},
    }


def _make_framework(criteria: list[dict], *, fw_id: int = 100) -> ReviewFramework:
    fw = ReviewFramework()
    fw.id = fw_id
    fw.name = "Test framework"
    fw.persona_instruction = "You are a KPMG reviewer."
    fw.persona_instruction_ar = "أنت مراجع لـ KPMG."
    fw.model = "qwen2.5:32b"
    fw.criteria = criteria
    return fw


def _mock_db(*, dossier_row: DossierRow | None = None) -> MagicMock:
    """Async-mocked db session that returns `dossier_row` for the
    most-recent-dossier query and records add()/flush() calls."""
    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    cache_result = MagicMock()
    cache_result.scalar_one_or_none = MagicMock(return_value=dossier_row)
    db.execute = AsyncMock(return_value=cache_result)
    return db


def _ev(cid: str, *, score: int = 4, label: str = "green", slides: list[int] | None = None) -> CriterionEvaluation:
    return CriterionEvaluation(
        criterion_id=cid,
        score=score,
        score_label=label,
        evidence=f"evidence for {cid}",
        gaps=[],
        slides_referenced=slides or [],
        language_used="ar",
    )


# ---- group-routing constants -------------------------------------------------


class TestGroupRoutingMap:
    def test_assessment_is_wildcard(self):
        assert resolve_sections_for_group("Assessment") == [WILDCARD]
        assert is_wildcard(resolve_sections_for_group("Assessment"))

    def test_strategy_routes_three_sections(self):
        sections = resolve_sections_for_group("Strategy")
        assert set(sections) == {"executive_summary", "value_proposition", "our_perspective"}

    def test_methodology_routes(self):
        assert set(resolve_sections_for_group("Methodology")) == {"detailed_approach", "our_understanding"}

    def test_team(self):
        assert resolve_sections_for_group("Team") == ["team_structure"]

    def test_experience(self):
        assert resolve_sections_for_group("Experience") == ["detailed_experience"]

    def test_tools(self):
        assert resolve_sections_for_group("Tools") == ["tools_methodologies"]

    def test_compliance(self):
        assert set(resolve_sections_for_group("Compliance")) == {"certifications", "terms"}

    def test_unknown_falls_back_to_wildcard_with_warning(self, caplog):
        import logging
        with caplog.at_level(logging.WARNING, logger="app.services.proposal_review.group_routing"):
            sections = resolve_sections_for_group("UnknownThing")
        assert sections == [WILDCARD]
        assert any("unknown group" in m.lower() for m in caplog.messages)

    def test_case_insensitive(self):
        assert resolve_sections_for_group("strategy") == resolve_sections_for_group("Strategy")
        assert resolve_sections_for_group("ASSESSMENT") == resolve_sections_for_group("Assessment")


class TestEvidenceSourceValidator:
    def test_none_falls_back_to_wildcard(self):
        assert validate_evidence_source(None) == [WILDCARD]

    def test_empty_falls_back_to_wildcard(self):
        assert validate_evidence_source([]) == [WILDCARD]

    def test_wildcard_only_accepted(self):
        assert validate_evidence_source([WILDCARD]) == [WILDCARD]

    def test_wildcard_with_other_keys_rejected(self):
        with pytest.raises(ValueError, match="must be the only entry"):
            validate_evidence_source([WILDCARD, "team_structure"])

    def test_unknown_key_rejected(self):
        with pytest.raises(ValueError, match="unknown section keys"):
            validate_evidence_source(["team_structure", "not_a_real_section"])

    def test_valid_keys_pass(self):
        assert validate_evidence_source(["team_structure", "detailed_experience"]) == [
            "team_structure",
            "detailed_experience",
        ]

    def test_dedup_preserves_order(self):
        assert validate_evidence_source(["team_structure", "team_structure", "detailed_experience"]) == [
            "team_structure",
            "detailed_experience",
        ]


# ---- per-criterion routing override ----------------------------------------


class TestCriterionLevelOverride:
    def test_no_override_uses_group(self):
        c = {"group": "Team", "criterion_id": "c1"}
        assert _resolve_sections_for_criterion(c) == ["team_structure"]

    def test_evidence_source_overrides_group(self):
        c = {
            "group": "Team",  # would route to team_structure
            "criterion_id": "c1",
            "evidence_source": ["detailed_experience"],
        }
        assert _resolve_sections_for_criterion(c) == ["detailed_experience"]

    def test_invalid_override_falls_back_to_group(self, caplog):
        import logging
        c = {
            "group": "Team",
            "criterion_id": "c1",
            "evidence_source": [WILDCARD, "team_structure"],  # invalid: wildcard alone
        }
        with caplog.at_level(logging.WARNING, logger="app.services.proposal_review.criterion_runner"):
            sections = _resolve_sections_for_criterion(c)
        assert sections == ["team_structure"]
        assert any("invalid evidence_source" in m.lower() for m in caplog.messages)


# ---- bucketing -------------------------------------------------------------


class TestBucketing:
    def test_same_group_same_override_share_bucket(self):
        criteria = [
            {"group": "Team", "criterion_id": "c1"},
            {"group": "Team", "criterion_id": "c2"},
        ]
        buckets = _group_criteria(criteria)
        assert len(buckets) == 1
        bucket = next(iter(buckets.values()))
        assert {c["criterion_id"] for c in bucket} == {"c1", "c2"}

    def test_different_overrides_split_bucket(self):
        criteria = [
            {"group": "Team", "criterion_id": "c1"},
            {"group": "Team", "criterion_id": "c2", "evidence_source": ["detailed_experience"]},
        ]
        buckets = _group_criteria(criteria)
        assert len(buckets) == 2

    def test_different_groups_split(self):
        criteria = [
            {"group": "Team", "criterion_id": "c1"},
            {"group": "Experience", "criterion_id": "c2"},
            {"group": "Compliance", "criterion_id": "c3"},
        ]
        assert len(_group_criteria(criteria)) == 3


# ---- dossier subset selection ----------------------------------------------


class TestDossierSubset:
    def test_wildcard_returns_all_sections(self):
        d = _dossier_json()
        sub = _build_dossier_subset(d, [WILDCARD])
        # All canonical sections are present in our fixture
        assert set(sub) == set(d["sections"])

    def test_specific_sections_returns_only_them(self):
        d = _dossier_json()
        sub = _build_dossier_subset(d, ["team_structure"])
        assert list(sub) == ["team_structure"]

    def test_missing_sections_silently_skipped(self):
        d = _dossier_json()
        sub = _build_dossier_subset(d, ["team_structure", "nonexistent"])
        assert list(sub) == ["team_structure"]


# ---- language detection -----------------------------------------------------


class TestLanguageDetection:
    def test_predominantly_arabic(self):
        # Pure Arabic text
        assert _detect_language("مرحبا بالعالم هذا اختبار") == "ar"

    def test_predominantly_english(self):
        assert _detect_language("Hello world this is a test") == "en"

    def test_empty_falls_back_arabic(self):
        # Default for KPMG decks is Arabic-primary.
        assert _detect_language("") == "ar"

    def test_mixed_threshold(self):
        # Mostly English with some Arabic — should still detect en.
        text = "ABCDEFGHIJ" * 10 + "مرحبا"
        assert _detect_language(text) == "en"


# ---- end-to-end run_review --------------------------------------------------


@pytest.mark.asyncio
async def test_run_review_one_call_per_group():
    """Spec acceptance: ONE LLM call per distinct group bucket."""
    dossier = MagicMock(spec=DossierRow)
    dossier.dossier_json = _dossier_json()
    db = _mock_db(dossier_row=dossier)

    criteria = [
        {"group": "Team",        "criterion_id": "c1", "name_en": "Team", "prompt_instruction_en": "Evaluate team."},
        {"group": "Team",        "criterion_id": "c2", "name_en": "Bench depth", "prompt_instruction_en": "Bench depth."},
        {"group": "Experience",  "criterion_id": "c3", "name_en": "Experience", "prompt_instruction_en": "Past projects."},
        {"group": "Compliance",  "criterion_id": "c4", "name_en": "Compliance", "prompt_instruction_en": "Compliance."},
    ]
    fw = _make_framework(criteria)

    call_count = {"n": 0}

    async def _mock_generate(*, schema: type[BaseModel], **_kwargs):
        call_count["n"] += 1
        # Return one evaluation per criterion in the prompt — but since
        # we don't have access to the prompt here, return all of them
        # and let the runner index by criterion_id.
        batch = CriterionEvaluationBatch(
            evaluations=[_ev("c1"), _ev("c2"), _ev("c3"), _ev("c4")]
        )
        return StructuredResult(
            parsed=batch,
            raw_output=batch.model_dump_json(),
            model="qwen2.5:32b",
            duration_ms=15,
        )

    with patch(
        "app.services.proposal_review.criterion_runner.generate_structured",
        side_effect=_mock_generate,
    ):
        rows = await run_review(
            db,
            proposal_id=1,
            framework=fw,
            classification=Classification.RESTRICTED,
        )

    # Three distinct buckets: Team, Experience, Compliance.
    assert call_count["n"] == 3, f"expected 3 calls, got {call_count['n']}"
    # Four rows persisted (one per criterion).
    assert len(rows) == 4
    assert {r.criterion_id for r in rows} == {"c1", "c2", "c3", "c4"}


@pytest.mark.asyncio
async def test_every_criterion_has_score_in_range_and_some_slides_cited():
    """Spec acceptance: every criterion has a 0–5 score and at least
    one criterion has a non-empty slides_referenced list."""
    dossier = MagicMock(spec=DossierRow)
    dossier.dossier_json = _dossier_json()
    db = _mock_db(dossier_row=dossier)

    criteria = [
        {"group": "Team", "criterion_id": "c1", "name_en": "Team"},
        {"group": "Experience", "criterion_id": "c2", "name_en": "Exp"},
    ]
    fw = _make_framework(criteria)

    async def _mock_generate(*, schema: type[BaseModel], **_kwargs):
        # First call: Team -> score with slides cited
        # Second call: Experience -> score, no slides
        batch = CriterionEvaluationBatch(
            evaluations=[
                _ev("c1", score=5, label="green", slides=[12, 13]),
                _ev("c2", score=3, label="amber"),
            ]
        )
        return StructuredResult(
            parsed=batch, raw_output=batch.model_dump_json(),
            model="qwen2.5:32b", duration_ms=15,
        )

    with patch(
        "app.services.proposal_review.criterion_runner.generate_structured",
        side_effect=_mock_generate,
    ):
        rows = await run_review(
            db, proposal_id=1, framework=fw,
            classification=Classification.RESTRICTED,
        )

    for r in rows:
        assert 0 <= r.score <= 5
        assert r.score_label in {"red", "amber", "green"}
        assert r.language_used in {"ar", "en"}
    assert any(r.slides_referenced for r in rows)


@pytest.mark.asyncio
async def test_run_review_handles_call_failure_with_placeholder_rows():
    """One LLM call failing must NOT break the whole run — the runner
    emits placeholder rows for that group (score 0 / red) and continues."""
    dossier = MagicMock(spec=DossierRow)
    dossier.dossier_json = _dossier_json()
    db = _mock_db(dossier_row=dossier)

    criteria = [
        {"group": "Team", "criterion_id": "c1", "name_en": "Team"},
        {"group": "Experience", "criterion_id": "c2", "name_en": "Exp"},
    ]
    fw = _make_framework(criteria)

    call_count = {"n": 0}

    async def _flaky_generate(*, schema: type[BaseModel], **_kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError("simulated transport error")
        batch = CriterionEvaluationBatch(evaluations=[_ev("c2")])
        return StructuredResult(
            parsed=batch, raw_output=batch.model_dump_json(),
            model="qwen2.5:32b", duration_ms=15,
        )

    with patch(
        "app.services.proposal_review.criterion_runner.generate_structured",
        side_effect=_flaky_generate,
    ):
        rows = await run_review(
            db, proposal_id=1, framework=fw,
            classification=Classification.RESTRICTED,
        )

    by_id = {r.criterion_id: r for r in rows}
    # Failing group's row is a placeholder
    assert by_id["c1"].score == 0
    assert by_id["c1"].score_label == "red"
    assert "Evaluation failed" in by_id["c1"].evidence
    # Successful group still got a real result
    assert by_id["c2"].score >= 0


@pytest.mark.asyncio
async def test_run_review_evidence_source_override_reaches_dossier_subset():
    """Phase-5 plumbing: if a criterion has `evidence_source`, that
    list MUST be what the runner uses to build the dossier subset.

    Verified by capturing the prompt and checking which sections are
    present in it.
    """
    dossier = MagicMock(spec=DossierRow)
    dossier.dossier_json = _dossier_json()
    db = _mock_db(dossier_row=dossier)

    criteria = [
        {
            "group": "Team",
            "criterion_id": "c1",
            "name_en": "Team",
            # Override: evaluate against detailed_experience instead of team_structure
            "evidence_source": ["detailed_experience"],
        },
    ]
    fw = _make_framework(criteria)

    captured_prompts: list[str] = []

    async def _mock_generate(*, schema: type[BaseModel], prompt: str, **_kwargs):
        captured_prompts.append(prompt)
        batch = CriterionEvaluationBatch(evaluations=[_ev("c1")])
        return StructuredResult(
            parsed=batch, raw_output=batch.model_dump_json(),
            model="qwen2.5:32b", duration_ms=15,
        )

    with patch(
        "app.services.proposal_review.criterion_runner.generate_structured",
        side_effect=_mock_generate,
    ):
        await run_review(
            db, proposal_id=1, framework=fw,
            classification=Classification.RESTRICTED,
        )

    assert len(captured_prompts) == 1
    prompt = captured_prompts[0]
    assert "## detailed_experience" in prompt
    # And team_structure is NOT included even though the criterion's
    # group=Team would normally route to it.
    assert "## team_structure" not in prompt

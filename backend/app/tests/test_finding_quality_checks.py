"""Tests for the three quality-check fixes added on top of the
structured-finding pipeline:

  #1-A — silent_truncation flag on SourceCoverage (set by the
         streaming runner after Ollama returns prompt_eval_count).
  #3-B — Pydantic validator on StrengthItem/GapItem.slides_referenced
         dedupes + sorts slide numbers regardless of input order.
  #4-A — detect_consistency_warnings flags score/summary/gap mismatches.
"""
from __future__ import annotations

import pytest

from app.services.structured_finding import (
    GapItem,
    SourceCoverage,
    StrengthItem,
    StructuredFinding,
    detect_consistency_warnings,
)


# ---------- #3-B — slide-citation dedup ---------------------------------------


class TestSlideCitationDedup:
    def test_strength_dedupes_duplicates(self):
        s = StrengthItem(title="x", slides_referenced=[63, 63, 63, 64])
        assert s.slides_referenced == [63, 64]

    def test_gap_dedupes_duplicates(self):
        g = GapItem(title="x", slides_referenced=[72, 72, 70, 68, 70])
        assert g.slides_referenced == [68, 70, 72]

    def test_sorts_ascending(self):
        s = StrengthItem(title="x", slides_referenced=[5, 1, 3, 2, 4])
        assert s.slides_referenced == [1, 2, 3, 4, 5]

    def test_drops_non_positive(self):
        s = StrengthItem(title="x", slides_referenced=[0, -1, 5, 3])
        assert s.slides_referenced == [3, 5]

    def test_empty_passes_through(self):
        s = StrengthItem(title="x", slides_referenced=[])
        assert s.slides_referenced == []

    def test_round_trip_via_json(self):
        # The validator runs on json deserialisation too (this is the
        # path Ollama output takes).
        raw = '{"title":"x","slides_referenced":[63,63,64,64,65]}'
        s = StrengthItem.model_validate_json(raw)
        assert s.slides_referenced == [63, 64, 65]


# ---------- #4-A — consistency warnings -------------------------------------


def _f(**kw) -> StructuredFinding:
    """Build a StructuredFinding with sane defaults; override fields per test."""
    base = dict(
        criterion_index=0,
        criterion_name="x",
        score=5.0,
        verdict="adequate",
        summary="",
        strengths=[],
        gaps=[],
    )
    base.update(kw)
    return StructuredFinding(**base)


class TestConsistencyWarnings:
    def test_no_warnings_when_clean(self):
        f = _f(score=8.0, summary="Solid presentation overall.",
               strengths=[StrengthItem(title="s")], gaps=[])
        assert detect_consistency_warnings(f) == []

    def test_low_score_with_positive_summary(self):
        # The actual gemma4 failure mode: 4.5 + "highly professional, ...".
        # We supply a strength so the no-evidence rule doesn't also fire.
        f = _f(
            score=4.5,
            summary="The presentation is highly professional, comprehensive, and well-structured.",
            strengths=[StrengthItem(title="x", slides_referenced=[1])],
        )
        warnings = detect_consistency_warnings(f)
        assert len(warnings) == 1
        assert "weak" in warnings[0].lower()
        assert "positive" in warnings[0].lower()

    def test_high_score_with_high_severity_gap(self):
        # The other failure mode: score=9 + a high-severity gap.
        f = _f(
            score=9.0,
            summary="Strong overall.",
            gaps=[GapItem(title="x", severity="high")],
        )
        warnings = detect_consistency_warnings(f)
        assert any("high-severity" in w.lower() for w in warnings)

    def test_high_score_with_many_gaps(self):
        f = _f(
            score=8.0,
            summary="Strong.",
            gaps=[
                GapItem(title="g1", severity="medium"),
                GapItem(title="g2", severity="medium"),
                GapItem(title="g3", severity="low"),
            ],
        )
        warnings = detect_consistency_warnings(f)
        assert any("3 gaps" in w for w in warnings)

    def test_high_score_with_negative_summary(self):
        f = _f(
            score=8.5,
            summary="The proposal lacks clear KPIs and is missing key sections.",
        )
        warnings = detect_consistency_warnings(f)
        assert any("negative" in w.lower() for w in warnings)

    def test_score_without_evidence(self):
        f = _f(score=7.0, summary="Looks good.", strengths=[], gaps=[])
        warnings = detect_consistency_warnings(f)
        assert any("no strengths or gaps" in w.lower() for w in warnings)

    def test_zero_score_without_evidence_is_fine(self):
        # The "insufficient evidence" canonical empty response
        # explicitly uses score=0 + empty arrays. That must NOT warn.
        f = _f(
            score=0.0,
            verdict="weak",
            summary="Insufficient evidence in the reviewed window.",
        )
        assert detect_consistency_warnings(f) == []

    def test_multiple_warnings_can_fire(self):
        # Score 3 (weak) + positive summary AND score-without-evidence
        # would BOTH fire, but score-without-evidence requires score>0
        # AND empty arrays. Let's check: score=3, positive summary,
        # empty arrays -> both warnings.
        f = _f(
            score=3.0,
            summary="The proposal is excellent and comprehensive.",
            strengths=[],
            gaps=[],
        )
        warnings = detect_consistency_warnings(f)
        # weak+positive + score-without-evidence
        assert len(warnings) >= 2


# ---------- #1-A — silent_truncation field on SourceCoverage ----------------


class TestSourceCoverageTruncationFields:
    def test_default_silent_truncation_false(self):
        cov = SourceCoverage(chars_total=100, chars_sent=100)
        assert cov.silent_truncation is False
        assert cov.tokens_consumed is None

    def test_explicit_truncation_round_trips(self):
        cov = SourceCoverage(
            chars_total=276135, chars_sent=276135,
            slides_total=178, slides_sent_max=178,
            tokens_consumed=4096,
            silent_truncation=True,
        )
        as_json = cov.model_dump_json()
        restored = SourceCoverage.model_validate_json(as_json)
        assert restored.silent_truncation is True
        assert restored.tokens_consumed == 4096

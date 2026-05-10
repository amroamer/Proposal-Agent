"""Tests for the structured per-criterion finding shape.

Coverage:
  - Pydantic round-trip for full + minimal payloads
  - JSON schema is well-formed (Ollama `format` consumer)
  - verdict_from_score band mapping
  - Markdown renderer used for the legacy export path
"""
from __future__ import annotations

import json

import pytest

from app.services.review_service import _structured_to_markdown
from app.services.structured_finding import (
    GapItem,
    StrengthItem,
    StructuredFinding,
    StructuredFindingPayload,
    verdict_from_score,
)


class TestVerdictFromScore:
    @pytest.mark.parametrize(
        "score,expected",
        [
            (10.0, "strong"),
            (8.5,  "strong"),
            (7.0,  "strong"),
            (6.9,  "adequate"),
            (5.0,  "adequate"),
            (4.9,  "weak"),
            (1.0,  "weak"),
            (0.0,  "weak"),
            (None, "weak"),
        ],
    )
    def test_band_mapping(self, score, expected):
        assert verdict_from_score(score) == expected


class TestStructuredFindingValidation:
    def test_minimal_payload(self):
        f = StructuredFinding(criterion_index=0, score=7.5)
        assert f.verdict == "adequate"  # default; server overwrites
        assert f.strengths == []
        assert f.gaps == []

    def test_full_payload_round_trip(self):
        payload = StructuredFindingPayload(
            finding=StructuredFinding(
                criterion_index=2,
                criterion_name="Value Proposition",
                score=8.5,
                verdict="strong",
                summary="Strong, evidence-based.",
                strengths=[
                    StrengthItem(
                        title="Contextual alignment to HHC",
                        detail="Maps capabilities to client needs.",
                        slides_referenced=[12, 13],
                    ),
                ],
                gaps=[
                    GapItem(
                        title="Missing KPIs",
                        detail="Outcomes not quantified.",
                        recommendation="Add a KPI table on slide 8.",
                        severity="medium",
                        slides_referenced=[8],
                    ),
                ],
                extra_recommendations=["Include a 90-day roadmap."],
            )
        )
        # Round-trip through JSON and re-validate.
        as_json = payload.model_dump_json()
        restored = StructuredFindingPayload.model_validate_json(as_json)
        assert restored == payload

    def test_score_clamped_and_rounded(self):
        f = StructuredFinding(criterion_index=0, score=7.49999)
        assert f.score == 7.5

    def test_score_out_of_range_rejected(self):
        with pytest.raises(ValueError):
            StructuredFinding(criterion_index=0, score=11.0)
        with pytest.raises(ValueError):
            StructuredFinding(criterion_index=0, score=-1.0)

    def test_severity_constrained(self):
        # Pydantic Literal — anything outside high/medium/low is rejected.
        with pytest.raises(ValueError):
            GapItem(title="x", severity="critical")  # type: ignore[arg-type]

    def test_json_schema_is_ollama_friendly(self):
        # Ollama's `format=<schema>` parameter consumes the schema dict
        # directly. It must be JSON-serialisable and have an object root.
        schema = StructuredFindingPayload.model_json_schema()
        json.dumps(schema)  # must not raise
        assert schema["type"] == "object"
        # Root has the wrapper `finding` key.
        assert "finding" in schema["properties"]

    def test_llm_finding_schema_excludes_coverage(self):
        # Coverage is server-computed; the model should never produce it.
        from app.services.structured_finding import llm_finding_schema

        schema = llm_finding_schema()
        defs = schema.get("$defs") or schema.get("definitions") or {}
        finding_def = defs["StructuredFinding"]
        assert "coverage" not in finding_def["properties"], (
            "coverage must be stripped from the LLM-facing schema"
        )
        # SourceCoverage definition shouldn't be referenced anywhere.
        assert "SourceCoverage" not in defs


class TestSourceCoverage:
    def test_compute_coverage_short_doc(self):
        from app.services.review_service import _compute_source_coverage

        doc = "## Slide 1\nfoo\n## Slide 2\nbar\n## Slide 3\nbaz"
        cov = _compute_source_coverage(doc)
        assert cov.slides_total == 3
        assert cov.slides_sent_min == 1
        assert cov.slides_sent_max == 3
        assert cov.chars_total == len(doc)
        assert cov.chars_sent == len(doc)
        assert cov.char_cap_hit is False

    def test_compute_coverage_truncated(self):
        from app.services.review_service import (
            MAX_DOC_CHARS,
            _compute_source_coverage,
        )

        # Build a doc that's longer than MAX_DOC_CHARS (now 400 KB) with
        # slide markers spread out enough that truncation cuts somewhere
        # in the middle. Each slide is ~3 KB so we need ~150+ slides to
        # exceed the 400 KB cap.
        slides = []
        for i in range(1, 250):
            slides.append(f"## Slide {i}\n" + ("x" * 3000))
        doc = "\n".join(slides)
        assert len(doc) > MAX_DOC_CHARS

        cov = _compute_source_coverage(doc)
        assert cov.char_cap_hit is True
        assert cov.chars_sent == MAX_DOC_CHARS
        assert cov.chars_total == len(doc)
        assert cov.slides_total == 249
        assert cov.slides_sent_max is not None
        assert cov.slides_sent_max < 249, (
            "truncation must cut before the last slide"
        )

    def test_compute_coverage_no_markers(self):
        from app.services.review_service import _compute_source_coverage

        cov = _compute_source_coverage("plain text with no slide markers")
        assert cov.slides_total == 0
        assert cov.slides_sent_max is None


class TestStructuredToMarkdown:
    def test_renders_strengths_with_slide_citation(self):
        f = StructuredFinding(
            criterion_index=0,
            criterion_name="X",
            score=8.0,
            strengths=[
                StrengthItem(
                    title="Strong evidence",
                    detail="Cited multiple cases.",
                    slides_referenced=[5, 6],
                )
            ],
        )
        md = _structured_to_markdown(f)
        assert "**Strengths**" in md
        assert "Strong evidence" in md
        assert "(slide 5, 6)" in md

    def test_renders_gaps_with_severity_and_recommendation(self):
        f = StructuredFinding(
            criterion_index=0,
            criterion_name="X",
            score=4.0,
            gaps=[
                GapItem(
                    title="Missing KPIs",
                    detail="Outcomes not quantified.",
                    recommendation="Add KPI table.",
                    severity="high",
                )
            ],
        )
        md = _structured_to_markdown(f)
        assert "**Gaps & Recommendations**" in md
        assert "[HIGH]" in md
        assert "Add KPI table." in md

    def test_empty_finding_renders_just_score(self):
        f = StructuredFinding(criterion_index=0, score=5.0)
        md = _structured_to_markdown(f)
        assert md.startswith("Score: 5.0/10")
        assert "**Strengths**" not in md
        assert "**Gaps" not in md

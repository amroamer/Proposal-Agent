"""Verify the streaming review honours each criterion's evidence_source.

The fix this covers: review_service.run_review_streaming used to send
the FULL extracted_text to every criterion, ignoring the per-criterion
evidence_source field configured on the framework. After the fix, the
helper `_assemble_criterion_text` produces a per-criterion document
slice — wildcard ['*'] keeps current whole-proposal behaviour; a list
of canonical section_keys narrows the input to those sections only.
"""
from __future__ import annotations

from app.services.proposal_review.section_splitter import (
    SlideText,
    split_slide_texts,
)
from app.services.review_service import (
    _assemble_criterion_text,
    _resolve_evidence_source,
)


def _build_sections():
    """Synthetic 8-slide deck spanning three canonical sections."""
    slides = [
        SlideText(slide_number=1, text="Cover slide"),
        SlideText(slide_number=2, text="02 – الملخص التنفيذي"),
        SlideText(slide_number=3, text="Executive summary body — KPMG strengths."),
        SlideText(slide_number=4, text="04 – القيمة التي نقدمها"),
        SlideText(slide_number=5, text="Value proposition body — 20% cycle reduction."),
        SlideText(slide_number=6, text="07 – الهيكل التنظيمي والسير الذاتية"),
        SlideText(slide_number=7, text="Team — Sara Ahmed, Engagement Partner."),
        SlideText(slide_number=8, text="Team — Khalid Saud, Project Manager."),
    ]
    return split_slide_texts(slides)


class TestResolveEvidenceSource:
    def test_missing_field_defaults_to_wildcard(self):
        assert _resolve_evidence_source({}) == ["*"]

    def test_explicit_wildcard(self):
        assert _resolve_evidence_source({"evidence_source": ["*"]}) == ["*"]

    def test_explicit_section_list(self):
        c = {"evidence_source": ["executive_summary", "value_proposition"]}
        assert _resolve_evidence_source(c) == ["executive_summary", "value_proposition"]

    def test_empty_list_falls_back_to_wildcard(self):
        assert _resolve_evidence_source({"evidence_source": []}) == ["*"]

    def test_garbage_value_falls_back(self):
        assert _resolve_evidence_source({"evidence_source": "nope"}) == ["*"]


class TestAssembleCriterionText:
    def test_wildcard_returns_full_extracted_text(self):
        sections = _build_sections()
        full = "## Slide 1\nfull doc"
        text, cov, used = _assemble_criterion_text(
            full_extracted_text=full,
            sections=sections,
            evidence_source=["*"],
        )
        assert text == full
        assert used == []
        assert cov.chars_total == len(full)

    def test_no_sections_object_returns_full(self):
        # Non-pptx files: sections=None, criterion gets whole doc
        # regardless of what evidence_source says.
        full = "page 1\npage 2"
        text, _, used = _assemble_criterion_text(
            full_extracted_text=full,
            sections=None,
            evidence_source=["executive_summary"],
        )
        assert text == full
        assert used == []

    def test_specific_sections_narrow_text(self):
        sections = _build_sections()
        text, _, used = _assemble_criterion_text(
            full_extracted_text="<unused>",
            sections=sections,
            evidence_source=["executive_summary", "value_proposition"],
        )
        assert "Executive summary body — KPMG strengths" in text
        assert "Value proposition body — 20% cycle reduction" in text
        # Team section is NOT in the requested set
        assert "Sara Ahmed" not in text
        assert "Khalid Saud" not in text
        assert used == ["executive_summary", "value_proposition"]

    def test_canonical_order_preserved(self):
        sections = _build_sections()
        # Request in REVERSE order — assembler should still produce
        # canonical order (executive_summary before value_proposition).
        text, _, used = _assemble_criterion_text(
            full_extracted_text="<unused>",
            sections=sections,
            evidence_source=["value_proposition", "executive_summary"],
        )
        assert used == ["executive_summary", "value_proposition"]
        es_pos = text.find("Executive summary body")
        vp_pos = text.find("Value proposition body")
        assert 0 <= es_pos < vp_pos

    def test_unknown_sections_skipped_silently(self):
        sections = _build_sections()
        # `kpmg_profile` is canonical but not in our synthetic deck.
        # Mixed with one valid key.
        text, _, used = _assemble_criterion_text(
            full_extracted_text="<unused>",
            sections=sections,
            evidence_source=["kpmg_profile", "executive_summary"],
        )
        assert "Executive summary body" in text
        assert used == ["executive_summary"]

    def test_zero_matches_falls_back_to_full_text(self, caplog):
        import logging
        sections = _build_sections()
        full = "fallback text"
        with caplog.at_level(logging.WARNING, logger="app.services.review_service"):
            text, _, used = _assemble_criterion_text(
                full_extracted_text=full,
                sections=sections,
                evidence_source=["kpmg_profile", "certifications"],  # neither present
            )
        assert text == full
        assert used == []
        assert any("did not match any section" in m for m in caplog.messages)

    def test_slide_markers_present_for_citation(self):
        # The model's citation depends on `## Slide N` markers being in
        # the text it sees. The assembler must inject them per slide.
        sections = _build_sections()
        text, cov, used = _assemble_criterion_text(
            full_extracted_text="<unused>",
            sections=sections,
            evidence_source=["team_structure"],
        )
        assert "## Slide 7" in text
        assert "## Slide 8" in text
        assert cov.slides_sent_min == 6  # the marker slide for section 07
        assert cov.slides_sent_max == 8

-- ============================================================
-- V019__review_findings.sql
-- Purpose:
--   Add a `findings` JSONB column to proposal_reviews. Stores the
--   structured per-criterion result produced by the streaming runner
--   (run_review_streaming) — strengths, gaps, recommendations, and
--   slide citations as data instead of free-form Markdown.
--
--   The existing `review_output` Markdown column is preserved: legacy
--   rows keep their content, new runs write BOTH (Markdown for export
--   and the legacy detail page; structured findings for the new
--   strengths-vs-gaps view).
--
--   Shape (validated by app.services.structured_finding.StructuredFinding):
--     [
--       {
--         "criterion_index": 0,
--         "criterion_name": "Value Proposition",
--         "score": 8.5,
--         "verdict": "strong" | "adequate" | "weak",
--         "summary": "…",
--         "strengths": [{ "title", "detail", "slides_referenced": [12,13] }, …],
--         "gaps":      [{ "title", "detail", "recommendation",
--                          "severity", "slides_referenced": [..] }, …],
--         "extra_recommendations": ["…"]
--       },
--       …
--     ]
--
--   Default '[]' so existing rows render the legacy Markdown view; the
--   UI falls back when `findings` is empty.
-- ============================================================

BEGIN;

ALTER TABLE proposal_reviews
    ADD COLUMN IF NOT EXISTS findings JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_reviews_findings_gin
    ON proposal_reviews USING GIN (findings);

INSERT INTO migrations_history (version, description)
VALUES ('V019', 'proposal_reviews: add findings JSONB for structured per-criterion data')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================
-- V016__proposal_criterion_reviews.sql
-- Purpose:
--   Granular per-criterion review results from the new framework-driven
--   review pipeline (Phase 4 of the proposal-review build).
--
--   Distinct from the legacy `proposal_reviews` table (V006) which
--   stores a single Markdown blob produced by one LLM call across all
--   criteria. The new pipeline:
--     1. Splits the .pptx into canonical sections (Phase 1).
--     2. Caches per-section facts in `dossiers` (Phase 3, V015).
--     3. Routes each criterion's `group` to a dossier subset.
--     4. Makes ONE batched LLM call per group, persisting one row per
--        criterion in this table.
--
--   `score_label` is the tri-colour readout consumed by the framework
--   editor UI; `score` is the underlying 0–5 numeric value. `evidence`
--   is the LLM's prose justification, `gaps` is a JSONB array of
--   identified deficiencies, `slides_referenced` is a JSONB int array
--   of slide numbers cited, `language_used` records the dominant
--   language of the source section ('ar' or 'en') so the UI can
--   render results RTL or LTR appropriately.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS proposal_criterion_reviews (
    id                BIGSERIAL    PRIMARY KEY,
    proposal_id       BIGINT       NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    framework_id      BIGINT       NOT NULL REFERENCES review_frameworks(id) ON DELETE CASCADE,
    -- Criteria themselves are stored as a JSONB array on review_frameworks,
    -- so criterion_id is a free-form identifier (e.g. UUID, slug, or
    -- sequential index from the array). Validated by the API layer.
    criterion_id      VARCHAR(100) NOT NULL,
    score             INTEGER      NOT NULL,
    score_label       VARCHAR(8)   NOT NULL,
    evidence          TEXT         NOT NULL DEFAULT '',
    gaps              JSONB        NOT NULL DEFAULT '[]'::jsonb,
    slides_referenced JSONB        NOT NULL DEFAULT '[]'::jsonb,
    language_used     VARCHAR(2)   NOT NULL DEFAULT 'ar',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (score BETWEEN 0 AND 5),
    CHECK (score_label IN ('red', 'amber', 'green')),
    CHECK (language_used IN ('ar', 'en'))
);

-- Look up the latest result set for a proposal+framework pair quickly —
-- the GET .../reviews/latest endpoint sorts by created_at DESC.
CREATE INDEX IF NOT EXISTS idx_pcr_proposal_fw_time
    ON proposal_criterion_reviews(proposal_id, framework_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pcr_proposal_criterion
    ON proposal_criterion_reviews(proposal_id, criterion_id);

DROP TRIGGER IF EXISTS trg_pcr_updated_at ON proposal_criterion_reviews;
CREATE TRIGGER trg_pcr_updated_at BEFORE UPDATE ON proposal_criterion_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V016', 'proposal_criterion_reviews: per-criterion results from framework runner')
ON CONFLICT (version) DO NOTHING;

COMMIT;

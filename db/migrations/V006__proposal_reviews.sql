-- ============================================================
-- V006__proposal_reviews.sql
-- Purpose: stores AI-driven reviews of uploaded proposal documents.
--          User uploads a .pptx/.docx/.pdf, supplies a prompt, the
--          backend extracts text, runs it through the local LLM, and
--          persists the result for later viewing.
-- Phase: MVP (review feature, vertical slice ahead of Phase 5)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS proposal_reviews (
    id                BIGSERIAL PRIMARY KEY,
    created_by        BIGINT NOT NULL REFERENCES users(id),
    source_filename   VARCHAR(500) NOT NULL,
    source_kind       VARCHAR(16)  NOT NULL,   -- 'pptx' | 'docx' | 'pdf'
    source_size_bytes INTEGER      NOT NULL,
    extracted_text    TEXT         NOT NULL,
    prompt            TEXT         NOT NULL,
    review_output     TEXT         NOT NULL,
    model             VARCHAR(100) NOT NULL,
    duration_ms       INTEGER      NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (source_kind IN ('pptx', 'docx', 'pdf'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_created_by_time
    ON proposal_reviews(created_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON proposal_reviews;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON proposal_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V006', 'proposal_reviews: AI review of uploaded proposals')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================
-- V008__review_metadata.sql
-- Purpose: extend proposal_reviews to store
--   - the AI-extracted document metadata (title, client name,
--     submission date, purpose & scope, mandatory requirements)
--   - the set of frameworks the user picked (now multi-select)
--   - the criterion names the user explicitly disabled at run time
--
-- All three are stored as JSONB / arrays so we don't have to
-- migrate again as the metadata shape evolves.
-- ============================================================

BEGIN;

ALTER TABLE proposal_reviews
    ADD COLUMN IF NOT EXISTS extracted_metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS framework_ids         BIGINT[]     NOT NULL DEFAULT '{}'::bigint[],
    ADD COLUMN IF NOT EXISTS disabled_criteria     TEXT[]       NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS document_class        VARCHAR(32)  NOT NULL DEFAULT 'proposal';

CREATE INDEX IF NOT EXISTS idx_reviews_doc_class
    ON proposal_reviews(document_class);

INSERT INTO migrations_history (version, description)
VALUES ('V008', 'review_metadata: extracted fields + multi-framework support')
ON CONFLICT (version) DO NOTHING;

COMMIT;

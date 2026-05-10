-- ============================================================
-- V014__proposal_classification.sql
-- Purpose:
--   Add the data-sovereignty classification field to `proposals`.
--   The proposal-review pipeline (Phase 3+) gates LLM provider
--   selection on this value: `Restricted` proposals MUST be processed
--   on local Ollama only — cloud providers are blocked at the
--   `app.services.proposal_review.llm_client` layer.
--
--   Default is `Restricted`. New rows inherit the safe option unless
--   the caller explicitly downgrades them, and existing rows are
--   backfilled to `Restricted` so they keep their data-sovereignty
--   guarantee.
-- ============================================================

BEGIN;

ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS classification VARCHAR(16) NOT NULL DEFAULT 'Restricted';

ALTER TABLE proposals
    DROP CONSTRAINT IF EXISTS proposals_classification_check;
ALTER TABLE proposals
    ADD  CONSTRAINT proposals_classification_check
        CHECK (classification IN ('Public', 'Internal', 'Restricted'));

CREATE INDEX IF NOT EXISTS idx_proposals_classification
    ON proposals(classification);

INSERT INTO migrations_history (version, description)
VALUES ('V014', 'proposals: add classification (Public/Internal/Restricted)')
ON CONFLICT (version) DO NOTHING;

COMMIT;

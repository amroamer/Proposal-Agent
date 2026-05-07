-- ============================================================
-- V005__proposals.sql
-- Purpose: concrete proposal documents. Like templates, sections
--          are stored as a JSONB array. status is a free-form
--          enum string with a CHECK so we can extend later
--          without a migration.
--
-- Section shape:
--   { "heading": str, "content": str }
-- Phase: MVP (Phase 7 prep — full collaboration in Phase 8)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS proposals (
    id            BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT REFERENCES users(id),
    template_id   BIGINT REFERENCES templates(id) ON DELETE SET NULL,
    title         VARCHAR(300) NOT NULL,
    client_name   VARCHAR(200) NOT NULL DEFAULT '',
    status        VARCHAR(32)  NOT NULL DEFAULT 'draft',
    sections      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    notes         TEXT         NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (status IN ('draft', 'in_review', 'approved', 'submitted', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_status      ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_owner       ON proposals(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at  ON proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_title_trgm  ON proposals USING GIN (title gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON proposals;
CREATE TRIGGER trg_proposals_updated_at BEFORE UPDATE ON proposals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V005', 'proposals: concrete proposal documents')
ON CONFLICT (version) DO NOTHING;

COMMIT;

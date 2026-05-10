-- ============================================================
-- V015__dossiers.sql
-- Purpose:
--   Cache table for the structured per-section "facts sheet" extracted
--   from a proposal's source document. The proposal-review pipeline
--   splits the .pptx once, runs one LLM extraction per canonical
--   section, validates each against its Pydantic schema, and stores
--   the aggregate as ONE row per (proposal, source_hash, model).
--
--   Cache key: source_hash (sha256 of the raw .pptx bytes) + model.
--   Re-running extraction with the same bytes & model returns the
--   existing row; uploading a new version of the proposal generates
--   a new hash and a new row.
--
--   `dossier_json` shape (validated by app.services.proposal_review
--   .dossier_schemas.Dossier):
--     {
--       proposal_id, source_hash, extracted_at, model,
--       sections: { section_key: <section-specific facts sheet>, ... },
--       section_starts: { section_key: slide_number, ... }
--     }
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS dossiers (
    id           BIGSERIAL    PRIMARY KEY,
    proposal_id  BIGINT       NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    source_hash  CHAR(64)     NOT NULL,
    model        VARCHAR(100) NOT NULL,
    dossier_json JSONB        NOT NULL,
    extracted_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Cache key. Same proposal + same bytes + same model => one row.
    CONSTRAINT dossiers_unique_key UNIQUE (proposal_id, source_hash, model)
);

CREATE INDEX IF NOT EXISTS idx_dossiers_proposal_id
    ON dossiers(proposal_id);

CREATE INDEX IF NOT EXISTS idx_dossiers_source_hash
    ON dossiers(source_hash);

DROP TRIGGER IF EXISTS trg_dossiers_updated_at ON dossiers;
CREATE TRIGGER trg_dossiers_updated_at BEFORE UPDATE ON dossiers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V015', 'dossiers: cached per-section facts sheets per (proposal, hash, model)')
ON CONFLICT (version) DO NOTHING;

COMMIT;

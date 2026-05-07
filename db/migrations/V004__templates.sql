-- ============================================================
-- V004__templates.sql
-- Purpose: reusable proposal skeletons. Sections are stored as a
--          JSONB array on the parent for MVP simplicity (avoids
--          the join + ordering bookkeeping a separate
--          template_sections table would need).
--
-- Section shape:
--   { "heading": str, "instructions": str, "default_content": str }
-- Phase: MVP (Phase 4 prep)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS templates (
    id            BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT REFERENCES users(id),
    name          VARCHAR(200) NOT NULL,
    description   TEXT         NOT NULL DEFAULT '',
    sections      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_name_trgm
    ON templates USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_templates_created_at
    ON templates(created_at DESC);

DROP TRIGGER IF EXISTS trg_templates_updated_at ON templates;
CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V004', 'templates: reusable proposal skeletons')
ON CONFLICT (version) DO NOTHING;

COMMIT;

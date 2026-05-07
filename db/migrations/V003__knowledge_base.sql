-- ============================================================
-- V003__knowledge_base.sql
-- Purpose: reusable content snippets categorized by service line
--          and free-form tags. Forms the corpus authors pull from
--          when writing templates / proposals.
-- Phase: MVP (precedes the full Phase 3 RAG pipeline)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_base_items (
    id            BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT REFERENCES users(id),
    title         VARCHAR(300) NOT NULL,
    category      VARCHAR(100) NOT NULL DEFAULT 'general',
    body          TEXT         NOT NULL,
    tags          JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_category    ON knowledge_base_items(category);
CREATE INDEX IF NOT EXISTS idx_kb_created_at  ON knowledge_base_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_tags_gin    ON knowledge_base_items USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_kb_title_trgm  ON knowledge_base_items USING GIN (title gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_kb_updated_at ON knowledge_base_items;
CREATE TRIGGER trg_kb_updated_at BEFORE UPDATE ON knowledge_base_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V003', 'knowledge_base: reusable content snippets')
ON CONFLICT (version) DO NOTHING;

COMMIT;

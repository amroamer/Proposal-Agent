-- ============================================================
-- V001__initial_schema.sql
-- Purpose: bootstrap extensions, shared functions, migration tracker
-- Phase: 1
-- ============================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid, column encryption
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector (semantic search, Phase 5)
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy/trigram search (Phase 3)

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migrations tracker
CREATE TABLE IF NOT EXISTS migrations_history (
    id              SERIAL PRIMARY KEY,
    version         VARCHAR(32)  NOT NULL UNIQUE,
    description     VARCHAR(255) NOT NULL,
    applied_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    applied_by      VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    execution_ms    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON migrations_history(applied_at);

INSERT INTO migrations_history (version, description)
VALUES ('V001', 'initial_schema: extensions, shared trigger, migrations_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;

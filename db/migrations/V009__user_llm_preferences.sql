-- ============================================================
-- V009__user_llm_preferences.sql
-- Purpose: per-user preferred LLM model + sampling parameters.
--          Used app-wide as the default whenever an explicit
--          override (e.g. a Framework's `model` field) isn't set.
--
-- All Ollama sampling parameters live under `options JSONB` so we
-- don't have to migrate again as Ollama adds new options.
-- Standard keys (any subset is fine; missing keys -> Ollama default):
--   temperature      (number 0–2, default 0.8)
--   top_p            (number 0–1, default 0.9)
--   top_k            (int,        default 40)
--   num_ctx          (int,        default 2048)
--   num_predict      (int,        default 128, -1 = unlimited)
--   repeat_penalty   (number,     default 1.1)
--   seed             (int,        default 0)
--   stop             (string[])
--   mirostat         (int 0/1/2)
--   mirostat_eta     (number)
--   mirostat_tau     (number)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_llm_preferences (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    model       VARCHAR(100),                       -- nullable -> use system default
    options     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_llm_prefs_updated_at ON user_llm_preferences;
CREATE TRIGGER trg_llm_prefs_updated_at BEFORE UPDATE ON user_llm_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO migrations_history (version, description)
VALUES ('V009', 'user_llm_preferences: per-user model + sampling params')
ON CONFLICT (version) DO NOTHING;

COMMIT;

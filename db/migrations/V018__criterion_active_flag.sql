-- ============================================================
-- V018__criterion_active_flag.sql
-- Purpose:
--   Add an `active: true` flag to every criterion in
--   `review_frameworks.criteria` that doesn't already have one.
--   Inactive criteria stay in the framework definition (so the
--   operator can re-enable them later) but the criterion runner
--   skips them at run time.
--
--   Default is `true` — same as the Pydantic schema default — so
--   pre-V018 criteria keep being evaluated unless explicitly
--   deactivated via the framework editor.
--
-- Idempotency:
--   The CASE branch leaves criteria that already have an `active`
--   key untouched. Re-running is a no-op.
-- ============================================================

BEGIN;

UPDATE review_frameworks rf
SET criteria = (
    SELECT jsonb_agg(
        CASE
            WHEN c ? 'active' THEN c
            ELSE c || jsonb_build_object('active', true)
        END
    )
    FROM jsonb_array_elements(rf.criteria) AS c
)
WHERE jsonb_typeof(rf.criteria) = 'array'
  AND jsonb_array_length(rf.criteria) > 0;

INSERT INTO migrations_history (version, description)
VALUES ('V018', 'review_frameworks.criteria[*]: backfill active=true')
ON CONFLICT (version) DO NOTHING;

COMMIT;

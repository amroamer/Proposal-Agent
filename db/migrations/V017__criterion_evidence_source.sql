-- ============================================================
-- V017__criterion_evidence_source.sql
-- Purpose:
--   Phase 5 of the proposal-review pipeline build. Move section-routing
--   from a code-driven map (group_routing.py) to a per-criterion field
--   that the framework editor UI can edit.
--
--   In this codebase criteria are stored as a JSONB array on
--   `review_frameworks.criteria`, NOT in a separate `criteria` table.
--   So instead of `ALTER TABLE criteria ADD COLUMN evidence_source`,
--   we extend each criterion JSON object in place with an
--   `evidence_source` key. The shape:
--
--     evidence_source: ["*"]                          (whole proposal)
--     evidence_source: ["team_structure", "..."]      (subset)
--
--   Validation that the value is well-formed (wildcard alone, or only
--   canonical section keys) is enforced at the API layer by the
--   FrameworkCriterion Pydantic schema. Postgres CHECK on JSON values
--   would be brittle as the section-key list evolves.
--
--   Backfill rules (mirrors GROUP_TO_SECTIONS in
--   app.services.proposal_review.group_routing):
--     Assessment   -> ["*"]
--     Strategy     -> ["executive_summary","value_proposition","our_perspective"]
--     Methodology  -> ["detailed_approach","our_understanding"]
--     Team         -> ["team_structure"]
--     Experience   -> ["detailed_experience"]
--     Tools        -> ["tools_methodologies"]
--     Compliance   -> ["certifications","terms"]
--     <anything else, including blank> -> ["*"]
--
--   The criterion runner already PREFERS criterion.evidence_source
--   over the group routing when present, so this backfill flips the
--   resolution path without changing behaviour for criteria whose
--   group already routes the way the operator wants.
--
-- Idempotency:
--   The CASE branch skips criteria that already have an
--   `evidence_source` key. Re-running the migration is a no-op for any
--   criterion that has already been backfilled or hand-edited.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Backfill: walk each framework's criteria array and add
-- `evidence_source` to every entry that lacks one.
-- ------------------------------------------------------------
UPDATE review_frameworks rf
SET criteria = (
    SELECT jsonb_agg(
        CASE
            WHEN c ? 'evidence_source' THEN c
            ELSE c || jsonb_build_object(
                'evidence_source',
                CASE LOWER(COALESCE(c->>'group', ''))
                    WHEN 'assessment'
                        THEN '["*"]'::jsonb
                    WHEN 'strategy'
                        THEN '["executive_summary","value_proposition","our_perspective"]'::jsonb
                    WHEN 'methodology'
                        THEN '["detailed_approach","our_understanding"]'::jsonb
                    WHEN 'team'
                        THEN '["team_structure"]'::jsonb
                    WHEN 'experience'
                        THEN '["detailed_experience"]'::jsonb
                    WHEN 'tools'
                        THEN '["tools_methodologies"]'::jsonb
                    WHEN 'compliance'
                        THEN '["certifications","terms"]'::jsonb
                    ELSE '["*"]'::jsonb
                END
            )
        END
    )
    FROM jsonb_array_elements(rf.criteria) AS c
)
WHERE jsonb_typeof(rf.criteria) = 'array'
  AND jsonb_array_length(rf.criteria) > 0;

INSERT INTO migrations_history (version, description)
VALUES ('V017', 'review_frameworks.criteria[*]: backfill evidence_source from group')
ON CONFLICT (version) DO NOTHING;

COMMIT;

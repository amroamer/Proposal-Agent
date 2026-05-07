-- ============================================================
-- V007__review_frameworks.sql
-- Purpose: structured review frameworks. Each framework defines
--          a persona + a set of criteria (dimensions) that the
--          AI evaluates a proposal against. Replaces free-form
--          review prompts with a reusable, named diagnostic.
--
-- Criterion shape:
--   { "name": str, "description": str, "prompt_instruction": str }
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS review_frameworks (
    id                  BIGSERIAL PRIMARY KEY,
    owner_user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    name                VARCHAR(200) NOT NULL,
    persona_instruction TEXT         NOT NULL DEFAULT '',
    model               VARCHAR(100) NOT NULL DEFAULT 'gemma4:latest',
    is_public           BOOLEAN      NOT NULL DEFAULT FALSE,
    criteria            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frameworks_owner      ON review_frameworks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_frameworks_public     ON review_frameworks(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_frameworks_name_trgm  ON review_frameworks USING GIN (name gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_frameworks_updated_at ON review_frameworks;
CREATE TRIGGER trg_frameworks_updated_at BEFORE UPDATE ON review_frameworks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the two frameworks shown in the design mocks so the screen has
-- something to render on a fresh install.
INSERT INTO review_frameworks (name, persona_instruction, is_public, criteria)
VALUES
(
    'Proposal Review Framework',
    'You are a top-tier management consultant from KPMG evaluating a critical proposal.',
    TRUE,
    '[
      {"name":"Section Readiness","description":"Checks for structural completeness based on TOC.","prompt_instruction":"Read the Table of Contents and verify if every section mentioned has corresponding content."},
      {"name":"Executive Summary Strength","description":"Evaluates the impact and quantification of the summary.","prompt_instruction":"Analyse the Executive Summary. Check if it quantifies ROI and articulates the \"why us\" proposition."},
      {"name":"Value Proposition","description":"Assess differentiation and client-centric value.","prompt_instruction":"Identify the core value proposition. Evaluate if it is focused on client outcomes."},
      {"name":"Scope Fulfillment","description":"Cross-references content against RFB requirements.","prompt_instruction":"Compare the document sections against the provided RFB requirements."},
      {"name":"Work Approach & Logic","description":"Checks activity sequencing and structural logic.","prompt_instruction":"Review the methodology. Check for logical flow between phases."},
      {"name":"Timeline & Efficiency","description":"Audit for timeline realism and overlaps.","prompt_instruction":"Analyse the Gantt chart. Check for unrealistic deadlines or resource bottlenecks."},
      {"name":"Leading Practices Alignment","description":"Ensures methodology reflects current industry standards.","prompt_instruction":"Cross-reference proposed tools with current industry benchmarks."},
      {"name":"Team Structure","description":"Validates seniority mix and CV alignment.","prompt_instruction":"Audit the team profiles. Check if proposed CVs match technical roles."},
      {"name":"Risks & Assumptions","description":"Evaluates mitigation proactivity.","prompt_instruction":"Review the Risk Register. Evaluate if mitigation plans are proactive."},
      {"name":"Legal & Compliance","description":"Checks validity of NDAs and MSAs.","prompt_instruction":"Verify legal annexes for expiration and template alignment."},
      {"name":"Client Name Check","description":"Rigorous find/replace for copy-paste errors.","prompt_instruction":"Scan for mentions of other clients or internal firm templates."},
      {"name":"Proofreading","description":"Grammar, typos, and formatting consistency.","prompt_instruction":"Perform a detailed spelling and grammar check."},
      {"name":"Storyline & Narrative","description":"Evaluates the \"Action Title\" narrative flow.","prompt_instruction":"Read all slide titles sequentially. Evaluate if they tell a cohesive story."}
    ]'::jsonb
),
(
    'Deliverable Quality Audit',
    'You are a senior quality reviewer auditing a client deliverable for accuracy and polish.',
    TRUE,
    '[
      {"name":"Factual Accuracy","description":"Verifies numbers, dates, and claims against the source data.","prompt_instruction":"Check every quantified claim. Flag any number, date, or named entity that cannot be verified from the document itself."},
      {"name":"Visual Consistency","description":"Branding, fonts, and slide layout alignment.","prompt_instruction":"Identify formatting inconsistencies — mixed fonts, off-brand colours, misaligned layouts."}
    ]'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO migrations_history (version, description)
VALUES ('V007', 'review_frameworks: structured review criteria')
ON CONFLICT (version) DO NOTHING;

COMMIT;

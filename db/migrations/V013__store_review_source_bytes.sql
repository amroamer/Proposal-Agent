-- ============================================================
-- V013__store_review_source_bytes.sql
-- Purpose:
--   Keep the original uploaded proposal file (PPTX/DOCX/PDF) so
--   reviewers can download or re-open it from the review detail
--   page. Until now we only persisted the extracted text; the
--   raw bytes were thrown away after parsing, so there was no
--   way to retrieve the source document.
--
--   Column is nullable so legacy reviews (rows created before
--   V013) keep working — they'll just show "source not stored"
--   on the UI's download button.
--
--   Sizes are capped at 50 MB by the API
--   (file_parser_service.MAX_BYTES). BYTEA inside Postgres is
--   acceptable at that ceiling for a Phase-1 internal tool;
--   migrate to object storage if review volume grows.
-- ============================================================

BEGIN;

ALTER TABLE proposal_reviews
    ADD COLUMN IF NOT EXISTS source_bytes BYTEA NULL;

INSERT INTO migrations_history (version, description)
VALUES ('V013', 'proposal_reviews: store original uploaded file bytes')
ON CONFLICT (version) DO NOTHING;

COMMIT;

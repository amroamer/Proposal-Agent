"""Proposal review pipeline.

Five-phase split:
  1. section_splitter      — deterministic .pptx -> per-section slide groups
  2. dossier_schemas       — Pydantic facts-sheet schemas per section
  3. extractor             — Celery extraction into `dossiers` (cached by hash)
  4. criterion_runner      — group-routed batched evaluation per framework
  5. evidence_source field — UI-editable override of the routing map
"""

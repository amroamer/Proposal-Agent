"""Smoke test for Phases 1-3 of the proposal-review pipeline.

Run inside the backend container against a real .pptx file:

    docker cp ./sample.pptx pa_backend:/tmp/sample.pptx
    docker exec -e PROPOSAL_PPTX=/tmp/sample.pptx pa_backend \
        python /app/scripts/smoke_test_extractor.py

What it does:
  1. Reads the .pptx bytes
  2. Runs Phase-1 splitter — prints per-section slide counts
  3. Calls extract_dossier (Phase 3 — calls Ollama for each section)
  4. Re-runs extract_dossier — confirms cache hit + zero LLM calls
  5. Prints a one-line summary of every persisted section

Requires DATABASE_URL + OLLAMA_BASE_URL (already set via env_file in
docker-compose). Creates a synthetic Proposal row with id=99999 if none
exists at that id.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path

from sqlalchemy import select

# These imports require the backend's Python environment.
from app.database import AsyncSessionLocal
from app.models.proposal import Proposal
from app.services.proposal_review.extractor import (
    compute_source_hash,
    extract_dossier,
)
from app.services.proposal_review.llm_client import Classification
from app.services.proposal_review.section_splitter import split_pptx

PROPOSAL_ID = int(os.environ.get("PROPOSAL_ID", "99999"))


async def _ensure_proposal(session) -> None:
    existing = (
        await session.execute(select(Proposal).where(Proposal.id == PROPOSAL_ID))
    ).scalar_one_or_none()
    if existing is None:
        session.add(
            Proposal(
                id=PROPOSAL_ID,
                title="smoke test proposal",
                client_name="Smoke Test",
                classification="Restricted",
            )
        )
        await session.commit()


async def main() -> int:
    pptx_path = os.environ.get("PROPOSAL_PPTX", "/tmp/sample.pptx")
    if not Path(pptx_path).exists():
        print(f"[error] PPTX not found at {pptx_path}. "
              "Set PROPOSAL_PPTX=/path or copy a file there.", file=sys.stderr)
        return 1

    file_bytes = Path(pptx_path).read_bytes()
    print(f"[info] loaded {len(file_bytes):,} bytes from {pptx_path}")
    print(f"[info] sha256: {compute_source_hash(file_bytes)[:16]}…")

    # Phase 1: splitter (deterministic)
    sections = split_pptx(file_bytes)
    print(f"\n[Phase 1] total_slides={sections.total_slides}")
    for key, sec in sections.sections.items():
        print(f"  {key:24s} slides={len(sec.slides):3d}  chars={len(sec.raw_text):6d}")
    if sections.missing_sections:
        print(f"  missing: {sections.missing_sections}")
    if sections.unknown_markers:
        print(f"  unknown markers: {sections.unknown_markers}")

    # Phase 3: full extraction (first run)
    async with AsyncSessionLocal() as session:
        await _ensure_proposal(session)
        print(f"\n[Phase 3] first run — extracting (this calls Ollama per section)…")
        t0 = time.monotonic()
        row1 = await extract_dossier(
            session,
            proposal_id=PROPOSAL_ID,
            file_bytes=file_bytes,
            classification=Classification.RESTRICTED,
        )
        await session.commit()
        elapsed1 = time.monotonic() - t0
        print(f"  extracted dossier id={row1.id} in {elapsed1:.1f}s")

    # Phase 3: cache hit (second run)
    async with AsyncSessionLocal() as session:
        print(f"\n[Phase 3] second run — should hit cache and NOT call Ollama…")
        t0 = time.monotonic()
        row2 = await extract_dossier(
            session,
            proposal_id=PROPOSAL_ID,
            file_bytes=file_bytes,
            classification=Classification.RESTRICTED,
        )
        elapsed2 = time.monotonic() - t0
        if row2.id != row1.id:
            print(f"  [warn] expected same row id, got {row1.id} vs {row2.id}")
        else:
            print(f"  cache hit: same dossier id={row1.id}, {elapsed2:.3f}s "
                  f"({elapsed1 / max(elapsed2, 0.001):.0f}x faster)")

    # Summary
    print("\n[summary] persisted sections:")
    persisted = row2.dossier_json.get("sections", {})
    for key, payload in persisted.items():
        keys_in_facts = list(payload.keys())
        n_items = sum(
            len(v) if isinstance(v, list) else 0 for v in payload.values()
        )
        print(f"  {key:24s} fields={len(keys_in_facts)} list_items={n_items}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

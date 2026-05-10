"""End-to-end smoke test for the streaming review pipeline.

Runs run_review_streaming against a real .pptx using the user's
preferred framework + LLM preference, then prints the new quality
signals (silent_truncation, dedup, consistency_warnings) so we can
verify the three fixes landed without bringing up the UI.

Run inside pa_backend:

    docker cp <path>/sample.pptx pa_backend:/tmp/sample.pptx
    docker exec -e PROPOSAL_PPTX=/tmp/sample.pptx \
                -e FRAMEWORK_ID=4 \
                -e USER_ID=1 \
                pa_backend python /app/scripts/smoke_test_streaming_review.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.review_framework import ReviewFramework
from app.models.user import User
from app.services.review_service import run_review_streaming


def _format_dur(ms: int) -> str:
    if ms < 1000:
        return f"{ms} ms"
    s = ms / 1000
    if s < 60:
        return f"{s:.1f} s"
    return f"{int(s // 60)}m {int(s % 60)}s"


async def main() -> int:
    pptx_path = os.environ.get("PROPOSAL_PPTX", "/tmp/sample.pptx")
    framework_id = int(os.environ.get("FRAMEWORK_ID", "4"))
    user_id = int(os.environ.get("USER_ID", "1"))

    if not Path(pptx_path).exists():
        print(f"[error] PPTX not found at {pptx_path}", file=sys.stderr)
        return 1

    file_bytes = Path(pptx_path).read_bytes()
    print(f"[info] file:        {pptx_path}")
    print(f"[info] file_size:   {len(file_bytes):,} bytes ({len(file_bytes)/1024/1024:.1f} MB)")
    print(f"[info] framework:   id={framework_id}")
    print(f"[info] user:        id={user_id}")
    print()

    async with AsyncSessionLocal() as session:
        fw = (await session.execute(
            select(ReviewFramework).where(ReviewFramework.id == framework_id)
        )).scalar_one_or_none()
        if fw is None:
            print(f"[error] framework {framework_id} not found", file=sys.stderr)
            return 1
        user = (await session.execute(
            select(User).where(User.id == user_id)
        )).scalar_one_or_none()
        if user is None:
            print(f"[error] user {user_id} not found", file=sys.stderr)
            return 1

        print(f"[info] framework name: {fw.name!r} model={fw.model!r}")
        active_criteria = [c for c in (fw.criteria or []) if c.get("active", True)]
        print(f"[info] active criteria: {len(active_criteria)}")
        for c in active_criteria:
            es = c.get("evidence_source") or ["*"]
            print(f"         - {c.get('name_en', '?')!r:50s} group={c.get('group')!r:15s} evidence_source={es}")
        print()

        print("[info] starting run_review_streaming…")
        t0 = time.time()
        events_by_type: dict[str, int] = {}
        findings: list[dict] = []

        async for event in run_review_streaming(
            session,
            user=user,
            filename=Path(pptx_path).name,
            file_bytes=file_bytes,
            frameworks=[fw],
        ):
            ev = event.get("event")
            data = event.get("data") or {}
            events_by_type[ev] = events_by_type.get(ev, 0) + 1

            if ev == "start":
                print(f"  [start] total_criteria={data.get('total_criteria')} "
                      f"frameworks={data.get('framework_names')} "
                      f"model={data.get('model')}")
            elif ev == "criterion_start":
                print(f"  [criterion_start] #{data.get('index')}: {data.get('name')!r}")
            elif ev == "criterion_done":
                f = data.get("finding") or {}
                findings.append(f)
                print(f"  [criterion_done] #{data.get('index')} {data.get('name')!r} "
                      f"score={data.get('score')} status={data.get('status')} "
                      f"duration={_format_dur(data.get('duration_ms', 0))}")
            elif ev == "criterion_error":
                print(f"  [criterion_error] #{data.get('index')} {data.get('name')!r}: "
                      f"{data.get('error')}")
            elif ev == "done":
                print(f"  [done] review_id={data.get('review_id')} "
                      f"total_duration={_format_dur(data.get('total_duration_ms', 0))} "
                      f"succeeded={data.get('succeeded')} failed={data.get('failed')}")

        wall = time.time() - t0
        print()
        print(f"[summary] wall_clock={_format_dur(int(wall*1000))}  events={events_by_type}")
        print()

        # ---- inspect each finding for the three new quality signals ----
        for f in findings:
            name = f.get("criterion_name", "?")
            score = f.get("score")
            verdict = f.get("verdict")
            cov = f.get("coverage") or {}
            warnings = f.get("consistency_warnings") or []
            strengths = f.get("strengths") or []
            gaps = f.get("gaps") or []

            print("=" * 78)
            print(f"  CRITERION: {name}")
            print(f"  score={score}  verdict={verdict}")
            print(f"  COVERAGE:")
            print(f"    chars: {cov.get('chars_sent', '?'):,} sent / {cov.get('chars_total', '?'):,} total"
                  f"  (char_cap_hit={cov.get('char_cap_hit')})")
            print(f"    slides: {cov.get('slides_sent_min')}..{cov.get('slides_sent_max')}"
                  f"  of {cov.get('slides_total')}")
            print(f"    tokens_consumed: {cov.get('tokens_consumed')}")
            est = cov.get("chars_sent", 0) / 3.0 if cov.get("chars_sent") else 0
            print(f"    estimated tokens (chars/3): {est:.0f}")
            silent = cov.get("silent_truncation", False)
            print(f"    SILENT_TRUNCATION: {'⚠ YES' if silent else 'no'}"
                  + ("" if not silent or not est
                     else f"  (consumed/estimated = {cov.get('tokens_consumed')}/{int(est)} = "
                          f"{100.0 * cov.get('tokens_consumed', 0) / max(est,1):.0f}%)"))

            # #3 dedup: any duplicates left after the validator?
            for s in strengths:
                slides = s.get("slides_referenced") or []
                if len(slides) != len(set(slides)):
                    print(f"    [WARN] strength has dupe slides: {slides}")
            for g in gaps:
                slides = g.get("slides_referenced") or []
                if len(slides) != len(set(slides)):
                    print(f"    [WARN] gap has dupe slides: {slides}")

            # #4 consistency
            print(f"  CONSISTENCY_WARNINGS: {len(warnings)}")
            for w in warnings:
                print(f"    ⚠ {w}")

            # Brief content
            print(f"  strengths: {len(strengths)}")
            for i, s in enumerate(strengths[:3]):
                print(f"    {i+1}. {s.get('title','')[:80]!r}  slides={s.get('slides_referenced')}")
            if len(strengths) > 3:
                print(f"    … {len(strengths)-3} more")
            print(f"  gaps: {len(gaps)}")
            for i, g in enumerate(gaps[:3]):
                print(f"    {i+1}. [{g.get('severity','?')}] "
                      f"{g.get('title','')[:80]!r}  slides={g.get('slides_referenced')}")
            if len(gaps) > 3:
                print(f"    … {len(gaps)-3} more")
            print()

        await session.commit()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

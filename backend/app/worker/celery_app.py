"""Celery application factory for the proposal-review pipeline.

Tasks live under `app.tasks.*` and are auto-discovered by name. The
broker + result backend are both Redis (per docker-compose; matches
the existing REDIS_URL setting).

Concurrency note: tasks in this pipeline make outbound HTTP calls to
Ollama, which is the bottleneck. Setting concurrency=4 lets the worker
keep multiple section extractions in flight at once for the parallel
dispatch step in extract_dossier.
"""
from __future__ import annotations

import logging

from celery import Celery

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

celery = Celery(
    "proposal_agent",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.extract_section",
        "app.tasks.extract_dossier",
        "app.tasks.run_review",
    ],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Riyadh",
    enable_utc=True,
    # Long Ollama calls — give the broker visibility timeout a generous
    # ceiling so a slow extraction doesn't get redelivered while still
    # in progress.
    broker_transport_options={"visibility_timeout": 60 * 60},
    # Keep results around long enough for the frontend to poll status.
    result_expires=60 * 60 * 24,
    # Per-task time budget — 10 min/section is generous for qwen2.5:32b.
    task_soft_time_limit=10 * 60,
    task_time_limit=12 * 60,
)

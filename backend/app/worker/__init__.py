"""Celery worker package.

The Celery app is in `celery_app` so commands like `celery -A app.worker
worker` Just Work — they import this package and look for a `celery`
attribute, which we re-export here.
"""
from .celery_app import celery as celery  # noqa: F401  (re-export)
from .celery_app import celery as celery_app  # noqa: F401  (legacy alias)

__all__ = ["celery", "celery_app"]

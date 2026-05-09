"""Startup bootstrap helpers.

Currently: idempotently create the first superadmin from
FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD env vars. Runs once on every
backend startup; no-op when a superadmin already exists, when the env
vars are blank, or when the DB isn't reachable yet (logged, never
fatal — we don't want a transient DB hiccup to keep the app from
serving traffic).

This replaces the manual `scripts/init-first-admin.sh` step in flows
where the deploy orchestrator doesn't shell into the container.
"""
import logging

from sqlalchemy import select

from app.config import get_settings
from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.models.user import User

logger = logging.getLogger(__name__)


async def bootstrap_first_admin() -> None:
    settings = get_settings()
    email = (settings.FIRST_ADMIN_EMAIL or "").strip().lower()
    password = settings.FIRST_ADMIN_PASSWORD or ""

    if not email or not password:
        logger.info("First-admin bootstrap skipped: FIRST_ADMIN_EMAIL/PASSWORD not set.")
        return

    try:
        async with AsyncSessionLocal() as db:
            existing = (
                await db.execute(select(User).where(User.is_superadmin.is_(True)))
            ).scalars().first()
            if existing:
                logger.info("First-admin bootstrap skipped: superadmin %s already exists.", existing.email)
                return

            user = User(
                email=email,
                full_name="System Administrator",
                hashed_password=hash_password(password),
                is_active=True,
                is_email_verified=True,
                is_superadmin=True,
            )
            db.add(user)
            await db.commit()
            logger.info("First-admin bootstrap created superadmin: %s", email)
    except Exception as e:
        # Don't crash the app on a bootstrap failure — degraded auth
        # is better than no API. Operator can re-roll the container or
        # run scripts/init-first-admin.sh manually.
        logger.warning("First-admin bootstrap failed: %s", e, exc_info=True)

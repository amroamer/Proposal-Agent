"""Per-user LLM preference service."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_llm_preference import UserLLMPreference


def _clean_options(opts: dict | None) -> dict:
    """Drop None/empty values so we don't override Ollama defaults
    with explicit nulls."""
    if not opts:
        return {}
    return {k: v for k, v in opts.items() if v is not None and v != ""}


async def get(db: AsyncSession, *, user: User) -> UserLLMPreference | None:
    q = await db.execute(
        select(UserLLMPreference).where(UserLLMPreference.user_id == user.id)
    )
    return q.scalar_one_or_none()


async def get_or_create(db: AsyncSession, *, user: User) -> UserLLMPreference:
    existing = await get(db, user=user)
    if existing:
        return existing
    pref = UserLLMPreference(user_id=user.id, model=None, options={})
    db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref


async def upsert(
    db: AsyncSession,
    *,
    user: User,
    model: str | None,
    options: dict,
) -> UserLLMPreference:
    """Create or update the user's preference row."""
    cleaned_model = (model or "").strip() or None
    cleaned_opts = _clean_options(options)

    existing = await get(db, user=user)
    if existing:
        existing.model = cleaned_model
        existing.options = cleaned_opts
        await db.commit()
        await db.refresh(existing)
        return existing

    pref = UserLLMPreference(
        user_id=user.id, model=cleaned_model, options=cleaned_opts
    )
    db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref

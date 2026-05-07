"""Admin user-management service + self-service profile."""
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import (
    AdminPasswordResetRequest,
    PasswordChangeRequest,
    ProfileUpdate,
    UserCreate,
    UserUpdate,
)


# ----- listing / filtering -----

ALLOWED_ROLE_FILTERS = {"all", "admin", "user"}
ALLOWED_STATUS_FILTERS = {"all", "active", "inactive", "deleted"}


async def create(db: AsyncSession, req: UserCreate) -> User:
    existing = await db.execute(select(User).where(User.email == req.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already in use.")

    user = User(
        email=req.email.lower(),
        full_name=req.full_name.strip(),
        hashed_password=hash_password(req.password),
        is_active=req.is_active,
        is_email_verified=True,  # admin-created accounts are pre-verified
        is_superadmin=req.is_superadmin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def list_users(
    db: AsyncSession,
    *,
    search: str | None = None,
    role: str = "all",       # all|admin|user
    status_f: str = "active", # all|active|inactive|deleted
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[User], int]:
    if role not in ALLOWED_ROLE_FILTERS:
        role = "all"
    if status_f not in ALLOWED_STATUS_FILTERS:
        status_f = "active"

    base = select(User)

    # Status filter
    if status_f == "deleted":
        base = base.where(User.deleted_at.is_not(None))
    elif status_f == "active":
        base = base.where(User.deleted_at.is_(None), User.is_active.is_(True))
    elif status_f == "inactive":
        base = base.where(User.deleted_at.is_(None), User.is_active.is_(False))
    # "all" -> no status filter (includes deleted)

    # Role filter
    if role == "admin":
        base = base.where(User.is_superadmin.is_(True))
    elif role == "user":
        base = base.where(User.is_superadmin.is_(False))

    # Search
    if search:
        s = f"%{search.lower()}%"
        base = base.where(or_(
            func.lower(User.email).like(s),
            func.lower(User.full_name).like(s),
        ))

    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(desc(User.created_at)).limit(limit).offset(offset)
    )
    return list(rows_q.scalars().all()), total


async def stats(db: AsyncSession) -> dict:
    """Aggregate counts shown at the top of the user list page."""
    rows = await db.execute(
        select(
            func.count().filter(User.deleted_at.is_(None)).label("alive"),
            func.count().filter(
                User.deleted_at.is_(None), User.is_active.is_(True)
            ).label("active"),
            func.count().filter(User.is_superadmin.is_(True), User.deleted_at.is_(None)).label("admins"),
            func.count().filter(User.deleted_at.is_not(None)).label("deleted"),
        ).select_from(User)
    )
    r = rows.one()
    return {
        "total": int(r.alive),
        "active": int(r.active),
        "admins": int(r.admins),
        "deleted": int(r.deleted),
    }


async def get(db: AsyncSession, *, user_id: int, include_deleted: bool = False) -> User | None:
    q = select(User).where(User.id == user_id)
    if not include_deleted:
        q = q.where(User.deleted_at.is_(None))
    res = await db.execute(q)
    return res.scalar_one_or_none()


async def update(db: AsyncSession, *, target: User, req: UserUpdate) -> User:
    if req.full_name is not None:
        target.full_name = req.full_name.strip()
    if req.is_active is not None:
        target.is_active = req.is_active
    if req.is_superadmin is not None:
        target.is_superadmin = req.is_superadmin
    await db.commit()
    await db.refresh(target)
    return target


async def soft_delete(db: AsyncSession, *, target: User) -> None:
    target.deleted_at = datetime.now(timezone.utc)
    target.is_active = False
    await db.commit()


async def restore(db: AsyncSession, *, target: User) -> User:
    target.deleted_at = None
    target.is_active = True
    target.failed_login_count = 0
    target.locked_until = None
    await db.commit()
    await db.refresh(target)
    return target


async def bulk_update_status(
    db: AsyncSession, *, ids: list[int], action: str, actor: User,
) -> int:
    """Run an action across many users at once. Returns rows affected."""
    if action not in ("activate", "deactivate", "delete", "restore"):
        raise HTTPException(status_code=400, detail=f"Unknown bulk action: {action}")

    targets_q = await db.execute(select(User).where(User.id.in_(ids)))
    targets = list(targets_q.scalars().all())
    affected = 0
    now = datetime.now(timezone.utc)

    for t in targets:
        # Refuse to touch your own account on destructive actions
        if t.id == actor.id and action in ("deactivate", "delete"):
            continue
        if action == "activate":
            if t.deleted_at is not None:
                continue  # restore first
            if not t.is_active:
                t.is_active = True
                affected += 1
        elif action == "deactivate":
            if t.deleted_at is not None or not t.is_active:
                continue
            t.is_active = False
            affected += 1
        elif action == "delete":
            if t.deleted_at is not None:
                continue
            t.deleted_at = now
            t.is_active = False
            affected += 1
        elif action == "restore":
            if t.deleted_at is None:
                continue
            t.deleted_at = None
            t.is_active = True
            t.failed_login_count = 0
            t.locked_until = None
            affected += 1

    await db.commit()
    return affected


async def admin_reset_password(
    db: AsyncSession, *, target: User, req: AdminPasswordResetRequest
) -> User:
    target.hashed_password = hash_password(req.new_password)
    target.failed_login_count = 0
    target.locked_until = None
    await db.commit()
    await db.refresh(target)
    return target


# ----- self-service -----

async def update_profile(
    db: AsyncSession, *, current: User, req: ProfileUpdate
) -> User:
    current.full_name = req.full_name.strip()
    await db.commit()
    await db.refresh(current)
    return current


async def change_password(
    db: AsyncSession, *, current: User, req: PasswordChangeRequest
) -> None:
    if not verify_password(req.current_password, current.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if req.current_password == req.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current one.",
        )
    current.hashed_password = hash_password(req.new_password)
    current.failed_login_count = 0
    await db.commit()

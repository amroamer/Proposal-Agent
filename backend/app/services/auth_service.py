"""Authentication service: signup, signin, tokens, lockout logic."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token, create_refresh_token, hash_password, verify_password,
)
from app.config import get_settings
from app.models.user import User
from app.schemas.auth import SignUpRequest, SignInRequest, TokenResponse

settings = get_settings()

MAX_FAILED = 5
LOCKOUT_MINUTES = 15


async def create_user(db: AsyncSession, req: SignUpRequest) -> User:
    existing = await db.execute(select(User).where(User.email == req.email.lower()))
    if existing.scalar_one_or_none():
        # Do not leak whether email exists. Return generic to caller.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to complete registration.",
        )

    user = User(
        email=req.email.lower(),
        full_name=req.full_name.strip(),
        hashed_password=hash_password(req.password),
        is_active=True,
        is_email_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, req: SignInRequest) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == req.email.lower()))
    user = result.scalar_one_or_none()

    # Generic error to avoid leaking whether email exists
    generic = HTTPException(status_code=401, detail="Invalid email or password.")

    if not user:
        raise generic

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=423,
            detail="Account is temporarily locked. Try again later.",
        )

    if not verify_password(req.password, user.hashed_password):
        user.failed_login_count += 1
        if user.failed_login_count >= MAX_FAILED:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
            user.failed_login_count = 0
        await db.commit()
        raise generic

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated.")

    # Success
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    jti = secrets.token_urlsafe(32)
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id), jti)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )

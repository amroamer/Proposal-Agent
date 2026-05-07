"""FastAPI dependencies for auth and DB access."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.core.security import decode_token
from app.database import get_db
from app.models.user import User

settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.APP_BASE_PATH}/api/v1/auth/signin",
    auto_error=False,
)


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.type != "access":
        raise HTTPException(status_code=401, detail="Wrong token type")

    result = await db.execute(select(User).where(User.id == int(payload.sub)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession   = Annotated[AsyncSession, Depends(get_db)]


async def require_superadmin(user: CurrentUser) -> User:
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Admin only.")
    return user


SuperAdmin = Annotated[User, Depends(require_superadmin)]

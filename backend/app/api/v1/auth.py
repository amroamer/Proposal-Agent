"""Auth endpoints: signup, signin, refresh, signout, password reset, me."""
from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.auth import (
    SignUpRequest, SignInRequest, TokenResponse,
    RefreshRequest, ForgotPasswordRequest, ResetPasswordRequest,
    UserResponse, VerifyEmailRequest,
)
from app.services import auth_service
from app.core.security import decode_token, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def signup(req: SignUpRequest, db: DbSession):
    user = await auth_service.create_user(db, req)
    # TODO: send verification email (Phase 1.5 — MailHog in dev)
    return user


@router.post("/signin", response_model=TokenResponse)
async def signin(req: SignInRequest, db: DbSession):
    return await auth_service.authenticate(db, req)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(req: RefreshRequest, db: DbSession):
    try:
        payload = decode_token(req.refresh_token)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.type != "refresh":
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Wrong token type")

    # In a full implementation, check a token-revocation store keyed by jti.
    new_access = create_access_token(payload.sub)
    from app.config import get_settings
    s = get_settings()
    return TokenResponse(
        access_token=new_access,
        refresh_token=req.refresh_token,
        expires_in=s.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/signout", status_code=status.HTTP_204_NO_CONTENT)
async def signout(current: CurrentUser):
    # Phase 1 stub: in Phase 2 we revoke the refresh token jti in Redis.
    return


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(req: ForgotPasswordRequest, db: DbSession):
    # Always return 202 to avoid email enumeration. Real work happens async.
    # Phase 1.5: enqueue Celery task to send reset link.
    return {"status": "accepted"}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(req: ResetPasswordRequest, db: DbSession):
    # Phase 1.5: look up token in password_reset_tokens, verify not expired, update password.
    from fastapi import HTTPException
    raise HTTPException(status_code=501, detail="Implemented in Phase 1.5")


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(req: VerifyEmailRequest, db: DbSession):
    from fastapi import HTTPException
    raise HTTPException(status_code=501, detail="Implemented in Phase 1.5")


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser):
    return user

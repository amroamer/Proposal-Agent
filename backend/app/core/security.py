"""Password hashing, JWT issuance/validation, token payload models."""
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.config import get_settings

settings = get_settings()

pwd_context = CryptContext(
    schemes=["argon2"],
    argon2__time_cost=settings.ARGON2_TIME_COST,
    argon2__memory_cost=settings.ARGON2_MEMORY_COST,
    argon2__parallelism=settings.ARGON2_PARALLELISM,
)


# ---------- Password ----------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


# ---------- Tokens ----------
class TokenPayload(BaseModel):
    sub: str           # user id
    type: str          # 'access' | 'refresh'
    exp: int
    iat: int
    jti: str | None = None


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    return _encode({
        "sub": subject, "type": "access",
        "iat": int(now.timestamp()), "exp": int(exp.timestamp()),
    })


def create_refresh_token(subject: str, jti: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    return _encode({
        "sub": subject, "type": "refresh", "jti": jti,
        "iat": int(now.timestamp()), "exp": int(exp.timestamp()),
    })


def decode_token(token: str) -> TokenPayload:
    try:
        raw = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return TokenPayload(**raw)
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e


# ---------- Password policy ----------
# Length-only policy: any 8+ characters accepted. Character-class rules
# (mixed case, digit, symbol) were dropped at the user's request.
PASSWORD_POLICY_MIN = 8


def validate_password_policy(password: str) -> list[str]:
    """Return a list of human-readable policy violations (empty = OK)."""
    errors: list[str] = []
    if len(password) < PASSWORD_POLICY_MIN:
        errors.append(f"Password must be at least {PASSWORD_POLICY_MIN} characters.")
    return errors

"""Pydantic DTOs for auth endpoints."""
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password_policy


class SignUpRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=12, max_length=128)
    accept_terms: bool = Field(..., description="Must be true; PDPL acceptance")

    @field_validator("password")
    @classmethod
    def check_password_policy(cls, v: str) -> str:
        errors = validate_password_policy(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v

    @field_validator("accept_terms")
    @classmethod
    def must_accept(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must accept the Terms and PDPL notice.")
        return v


class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password_policy(cls, v: str) -> str:
        errors = validate_password_policy(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    is_active: bool
    is_email_verified: bool
    is_superadmin: bool
    created_at: datetime
    last_login_at: datetime | None

    class Config:
        from_attributes = True


class VerifyEmailRequest(BaseModel):
    token: str

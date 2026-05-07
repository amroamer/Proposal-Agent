"""Pydantic DTOs for admin user-management endpoints."""
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password_policy


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=200)
    password: str = Field(..., min_length=12, max_length=128)
    is_active: bool = True
    is_superadmin: bool = False

    @field_validator("password")
    @classmethod
    def check_password_policy(cls, v: str) -> str:
        errors = validate_password_policy(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=200)
    is_active: bool | None = None
    is_superadmin: bool | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password_policy(cls, v: str) -> str:
        errors = validate_password_policy(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v


class AdminPasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def check_password_policy(cls, v: str) -> str:
        errors = validate_password_policy(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v


class ProfileUpdate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)


class UserAdminResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    is_active: bool
    is_email_verified: bool
    is_superadmin: bool
    last_login_at: datetime | None
    created_at: datetime
    deleted_at: datetime | None = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: list[UserAdminResponse]
    total: int


class UserStats(BaseModel):
    total: int     # alive (not deleted)
    active: int    # alive AND is_active
    admins: int    # alive AND is_superadmin
    deleted: int   # soft-deleted


class UserAuditEvent(BaseModel):
    id: int
    actor_user_id: int | None
    action: str
    entity_type: str | None
    entity_id: str | None
    metadata: dict
    ip_address: str | None
    user_agent: str | None
    occurred_at: datetime

    class Config:
        from_attributes = True


class UserAuditResponse(BaseModel):
    items: list[UserAuditEvent]
    total: int


class BulkAction(BaseModel):
    """Body for the bulk-update endpoint."""
    user_ids: list[int] = Field(..., min_length=1, max_length=500)
    action: str = Field(..., description="activate | deactivate | delete | restore")

"""Unit tests for auth schema validation."""
import os
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://t:t@localhost/t")
os.environ.setdefault("JWT_SECRET_KEY", "x" * 64)

import pytest
from pydantic import ValidationError

from app.schemas.auth import SignUpRequest, SignInRequest, ResetPasswordRequest


class TestSignUpRequestValidation:
    def test_valid_signup(self):
        req = SignUpRequest(
            email="user@kpmg.com",
            full_name="Test User",
            password="ValidPass-123!",
            accept_terms=True,
        )
        assert req.email == "user@kpmg.com"

    def test_rejects_invalid_email(self):
        with pytest.raises(ValidationError):
            SignUpRequest(
                email="not-an-email",
                full_name="User",
                password="ValidPass-123!",
                accept_terms=True,
            )

    def test_rejects_weak_password(self):
        with pytest.raises(ValidationError):
            SignUpRequest(
                email="user@kpmg.com",
                full_name="User",
                password="weak",
                accept_terms=True,
            )

    def test_rejects_not_accepting_terms(self):
        with pytest.raises(ValidationError):
            SignUpRequest(
                email="user@kpmg.com",
                full_name="User",
                password="ValidPass-123!",
                accept_terms=False,
            )


class TestSignInRequestValidation:
    def test_valid_signin(self):
        req = SignInRequest(email="user@kpmg.com", password="anything")
        assert req.email == "user@kpmg.com"

    def test_rejects_invalid_email(self):
        with pytest.raises(ValidationError):
            SignInRequest(email="bogus", password="anything")


class TestResetPasswordRequestValidation:
    def test_valid(self):
        req = ResetPasswordRequest(token="xyz", new_password="ValidPass-123!")
        assert req.token == "xyz"

    def test_rejects_weak(self):
        with pytest.raises(ValidationError):
            ResetPasswordRequest(token="xyz", new_password="weak")

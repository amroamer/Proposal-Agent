"""Unit tests for core.security: hashing, JWT, password policy."""
import os
import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://t:t@localhost/t")
os.environ.setdefault("JWT_SECRET_KEY", "x" * 64)

from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    validate_password_policy,
)


# ---------- Password hashing ----------
class TestPasswordHashing:
    def test_hash_verify_round_trip(self):
        h = hash_password("CorrectHorseBattery9!")
        assert verify_password("CorrectHorseBattery9!", h) is True

    def test_verify_rejects_wrong_password(self):
        h = hash_password("CorrectHorseBattery9!")
        assert verify_password("wrong", h) is False

    def test_hash_is_not_plaintext(self):
        h = hash_password("Secret-P@ssw0rd1")
        assert "Secret-P@ssw0rd1" not in h
        assert h.startswith("$argon2")

    def test_two_hashes_of_same_password_differ(self):
        h1 = hash_password("Same-Password-1!")
        h2 = hash_password("Same-Password-1!")
        assert h1 != h2  # salted


# ---------- JWT ----------
class TestJWT:
    def test_access_token_round_trip(self):
        token = create_access_token("42")
        payload = decode_token(token)
        assert payload.sub == "42"
        assert payload.type == "access"

    def test_refresh_token_has_jti(self):
        token = create_refresh_token("42", "abc-jti")
        payload = decode_token(token)
        assert payload.type == "refresh"
        assert payload.jti == "abc-jti"

    def test_tampered_token_raises(self):
        token = create_access_token("42")
        with pytest.raises(ValueError):
            decode_token(token + "tamper")


# ---------- Password policy ----------
class TestPasswordPolicy:
    def test_valid_password_no_errors(self):
        assert validate_password_policy("ValidPass-123!") == []

    def test_too_short(self):
        errs = validate_password_policy("Ab1!")
        assert any("12 characters" in e for e in errs)

    def test_missing_uppercase(self):
        errs = validate_password_policy("nocapsstring-1!")
        assert any("uppercase" in e for e in errs)

    def test_missing_lowercase(self):
        errs = validate_password_policy("ALLCAPSSTRING-1!")
        assert any("lowercase" in e for e in errs)

    def test_missing_digit(self):
        errs = validate_password_policy("NoDigitsEver-!!")
        assert any("digit" in e for e in errs)

    def test_missing_symbol(self):
        errs = validate_password_policy("NoSymbolsHere123")
        assert any("symbol" in e for e in errs)

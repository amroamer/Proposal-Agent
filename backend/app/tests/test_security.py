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
# Length-only policy: any 8+ characters accepted.
class TestPasswordPolicy:
    def test_eight_chars_no_errors(self):
        assert validate_password_policy("abcdefgh") == []

    def test_complex_password_still_ok(self):
        assert validate_password_policy("ValidPass-123!") == []

    def test_too_short(self):
        errs = validate_password_policy("abc1234")  # 7 chars
        assert any("8 characters" in e for e in errs)

    def test_simple_password_accepted(self):
        # No more uppercase / lowercase / digit / symbol requirements.
        assert validate_password_policy("aaaaaaaa") == []
        assert validate_password_policy("12345678") == []
        assert validate_password_policy("ALLCAPSS") == []

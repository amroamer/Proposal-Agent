"""Verify the data-sovereignty gate cannot regress silently.

Spec: every call must go through `llm_client.generate_structured`,
which refuses to call a cloud provider on a Restricted proposal. The
gate is enforced before any network I/O, so we test it without
needing a live Ollama instance.
"""
from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.services.proposal_review.llm_client import (
    Classification,
    Provider,
    _assert_allowed_for_classification,
    generate_structured,
)


class _DummyFacts(BaseModel):
    note: str = ""


class TestClassificationCoercion:
    def test_default_is_restricted(self):
        assert Classification.coerce(None) == Classification.RESTRICTED
        assert Classification.coerce("") == Classification.RESTRICTED

    def test_known_values_round_trip(self):
        for v in ("Public", "Internal", "Restricted"):
            assert Classification.coerce(v).value == v

    def test_unknown_falls_back_to_restricted(self):
        # Mis-typed / future value MUST fail closed.
        assert Classification.coerce("Sensitive") == Classification.RESTRICTED
        assert Classification.coerce("public") == Classification.RESTRICTED  # case-strict


class TestSovereigntyGate:
    def test_local_provider_allowed_for_restricted(self):
        # Should NOT raise.
        _assert_allowed_for_classification(
            Provider.LOCAL_OLLAMA, Classification.RESTRICTED
        )

    def test_cloud_provider_blocked_for_restricted(self):
        # Synthesise a cloud provider value via Provider's enum coercion.
        # We can't add a real cloud Provider in tests because Provider
        # is a closed enum — but the gate function takes Provider, and
        # the value-prefix check is what it looks at. So construct one.
        from enum import Enum

        class FakeProvider(str, Enum):
            CLOUD_FOO = "cloud_foo"

        with pytest.raises(PermissionError, match="Restricted proposals must use a local"):
            _assert_allowed_for_classification(
                FakeProvider.CLOUD_FOO, Classification.RESTRICTED
            )

    def test_cloud_provider_allowed_for_public(self):
        from enum import Enum

        class FakeProvider(str, Enum):
            CLOUD_FOO = "cloud_foo"

        # Should NOT raise — Public proposals can go anywhere.
        _assert_allowed_for_classification(
            FakeProvider.CLOUD_FOO, Classification.PUBLIC
        )

    def test_cloud_provider_allowed_for_internal(self):
        from enum import Enum

        class FakeProvider(str, Enum):
            CLOUD_FOO = "cloud_foo"

        _assert_allowed_for_classification(
            FakeProvider.CLOUD_FOO, Classification.INTERNAL
        )


class TestGenerateStructuredEnforcesGate:
    @pytest.mark.asyncio
    async def test_restricted_with_cloud_provider_raises_before_network(self):
        # We construct a synthetic cloud Provider value — this MUST
        # raise PermissionError immediately, no Ollama call.
        from enum import Enum

        class FakeProvider(str, Enum):
            CLOUD_FOO = "cloud_foo"

        with pytest.raises(PermissionError):
            await generate_structured(
                prompt="anything",
                schema=_DummyFacts,
                classification=Classification.RESTRICTED,
                provider=FakeProvider.CLOUD_FOO,  # type: ignore[arg-type]
            )

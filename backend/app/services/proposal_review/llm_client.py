"""Single chokepoint for every LLM call made by the proposal-review pipeline.

Why this exists separately from `app.services.ollama_service`:

  - `ollama_service` is the transport. Anything that wants to talk to a
    model goes through it.
  - `llm_client` is POLICY: it enforces KSA data-sovereignty rules on
    top of the transport. Today the only provider is local Ollama, so
    the policy enforcement is scaffolding — but it is wired up so any
    future cloud-LLM addition CANNOT bypass it for `Restricted` work.

Rules (see docs/data_sovereignty.md):

  1. Every proposal carries a `classification` field. Default is
     `Restricted` so the safe option is the default.
  2. A `Restricted` proposal MAY be processed only on a LOCAL provider.
     Today: `local_ollama`. If a future provider registers as `cloud_*`
     and we hand it a Restricted proposal, this module raises.
  3. Non-Restricted (`Public`, `Internal`) proposals MAY use any
     registered provider.

The wrapper also enforces the structured-output contract: every call
sites a Pydantic schema, we forward its JSON Schema to Ollama as the
`format` parameter, and round-trip the response through the schema.
NO regex parsing of model output. If the response doesn't validate, the
caller is told (for retry) — we do NOT silently repair JSON.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from enum import Enum
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.services import ollama_service

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class Classification(str, Enum):
    """Proposal classifications. `Restricted` is the safe default — it
    pins the proposal to local-only inference."""

    PUBLIC = "Public"
    INTERNAL = "Internal"
    RESTRICTED = "Restricted"

    @classmethod
    def coerce(cls, value: str | None) -> "Classification":
        if not value:
            return cls.RESTRICTED
        try:
            return cls(value)
        except ValueError:
            logger.warning(
                "llm_client: unknown classification %r — defaulting to Restricted",
                value,
            )
            return cls.RESTRICTED


class Provider(str, Enum):
    LOCAL_OLLAMA = "local_ollama"
    # Future cloud providers MUST be added here with `cloud_` prefix so
    # the gate logic in `_assert_allowed_for_classification` rejects
    # them automatically for Restricted proposals.


def _assert_allowed_for_classification(
    provider: Provider, classification: Classification
) -> None:
    """Raise if `provider` is not allowed for `classification`.

    Restricted proposals are local-only. Future cloud providers (any
    Provider whose value starts with 'cloud_') are explicitly blocked
    here — fail-closed so adding a new cloud provider doesn't silently
    open a Restricted-data leak.
    """
    if classification != Classification.RESTRICTED:
        return
    if provider.value.startswith("cloud_"):
        raise PermissionError(
            f"Restricted proposals must use a local LLM provider. "
            f"Refusing to call {provider.value} on Restricted content."
        )


@dataclass
class StructuredResult:
    parsed: BaseModel
    raw_output: str
    model: str
    duration_ms: int


def _resolve_default_model() -> str:
    """Read the dossier-extraction model from env, falling back to the
    spec default (`qwen2.5:32b`).

    Independent of `ollama_service.DEFAULT_MODEL` so the framework-review
    feature can pick a different (e.g. larger) model than the legacy
    free-form review feature without coupling them.
    """
    return (
        os.environ.get("LLM_MODEL")
        or os.environ.get("PROPOSAL_REVIEW_MODEL")
        or "qwen2.5:32b"
    )


async def generate_structured(
    *,
    prompt: str,
    schema: type[T],
    classification: Classification,
    system: str | None = None,
    model: str | None = None,
    options: dict | None = None,
    provider: Provider = Provider.LOCAL_OLLAMA,
    timeout_s: int | None = None,
) -> StructuredResult:
    """Call the LLM and validate its response against `schema`.

    Validation flow:
      1. Reject the call up front if `classification`/`provider` is
         disallowed. (Today: only Restricted+cloud_* fails.)
      2. Convert `schema.model_json_schema()` -> Ollama's `format` arg.
      3. Send the call. The response is JSON because the model is held
         to the format schema.
      4. `schema.model_validate_json(response.output)`. ValidationError
         escapes verbatim — caller decides whether to retry.

    NOT a try/except wrapper that "repairs" malformed JSON. If the model
    couldn't follow the schema, the caller gets the validation error and
    is responsible for one retry, then a clean failure.
    """
    _assert_allowed_for_classification(provider, classification)

    json_schema = schema.model_json_schema()
    used_model = model or _resolve_default_model()

    logger.info(
        "llm_client.generate_structured provider=%s classification=%s "
        "model=%s schema=%s prompt_chars=%d",
        provider.value,
        classification.value,
        used_model,
        schema.__name__,
        len(prompt),
    )

    if provider == Provider.LOCAL_OLLAMA:
        result = await ollama_service.generate(
            prompt,
            system=system,
            model=used_model,
            options=options,
            timeout_s=timeout_s,
            format=json_schema,
        )
    else:  # pragma: no cover — no cloud provider exists yet
        raise NotImplementedError(f"No transport implemented for provider={provider}")

    try:
        parsed = schema.model_validate_json(result.output)
    except ValidationError as e:
        # Bubble up. The extractor retries once; downstream we never
        # try to "repair" model output via regex / sanitisers.
        logger.warning(
            "llm_client.generate_structured: schema=%s validation failed: %s",
            schema.__name__, e,
        )
        raise
    except json.JSONDecodeError as e:
        # Ollama with `format=<schema>` should produce strict JSON;
        # if it didn't, treat as a validation failure.
        logger.warning(
            "llm_client.generate_structured: schema=%s non-JSON output: %s",
            schema.__name__, e,
        )
        raise ValidationError.from_exception_data(  # noqa: SLF001 — pydantic v2 API
            schema.__name__,
            [{"type": "json_invalid", "loc": (), "input": result.output[:200], "ctx": {"error": str(e)}}],
        ) from e

    return StructuredResult(
        parsed=parsed,
        raw_output=result.output,
        model=result.model,
        duration_ms=result.duration_ms,
    )

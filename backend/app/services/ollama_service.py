"""Thin async client for the host Ollama HTTP API."""
import logging
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# The host has multiple Ollama instances accessible at different addresses.
# From inside the backend container (via host.docker.internal:11434), only
# `gemma4:latest` (8B) and `nomic-embed-text` are reachable as of MVP cut.
# `gemma4:26b` exists on the loopback Ollama but isn't visible here.
DEFAULT_MODEL = "gemma4:latest"


@dataclass
class GenerateResult:
    output: str
    model: str
    duration_ms: int
    prompt_eval_count: int | None = None
    eval_count: int | None = None


class OllamaError(RuntimeError):
    pass


async def list_models() -> list[dict]:
    """Return the raw `models` list from the host Ollama's /api/tags.

    Each entry has at least `name` and `details.parameter_size`.
    Raises OllamaError on transport / non-2xx.
    """
    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
    except httpx.HTTPError as e:
        raise OllamaError(f"Ollama transport error: {e}") from e
    if r.status_code != 200:
        raise OllamaError(f"Ollama HTTP {r.status_code}: {r.text[:500]}")
    data = r.json()
    return data.get("models", [])


async def generate(
    prompt: str,
    *,
    system: str | None = None,
    model: str = DEFAULT_MODEL,
    options: dict | None = None,
    timeout_s: int | None = None,
) -> GenerateResult:
    """Single-shot non-streaming call to Ollama's /api/generate.

    `options` is a dict of standard Ollama sampling/generation options
    (temperature, top_p, top_k, num_ctx, num_predict, repeat_penalty,
    seed, mirostat*, stop, ...). Missing keys fall back to model defaults.

    Raises OllamaError on transport failure or non-2xx response.
    """
    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate"
    timeout = httpx.Timeout(timeout_s or settings.LLM_REQUEST_TIMEOUT_SECONDS)

    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system
    cleaned_options = {k: v for k, v in (options or {}).items() if v is not None and v != ""}
    if cleaned_options:
        payload["options"] = cleaned_options

    logger.info(
        "Ollama generate model=%s prompt_chars=%d opts=%s",
        model, len(prompt), list(cleaned_options.keys()) or "default",
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, json=payload)
    except httpx.HTTPError as e:
        raise OllamaError(f"Ollama transport error: {e}") from e

    if r.status_code != 200:
        # Ollama returns helpful text on 404 (model not pulled), 500 etc.
        raise OllamaError(f"Ollama HTTP {r.status_code}: {r.text[:500]}")

    data = r.json()
    output = data.get("response", "").strip()
    done_reason = data.get("done_reason")
    if not output:
        # Empty response is unusual but legitimate — typically means the model
        # hit the num_predict cap before emitting user-visible text. Surface it
        # as a clear runtime error so callers (and the user) know the
        # configuration produced nothing useful.
        raise OllamaError(
            "Ollama produced no output text. "
            f"done_reason={done_reason!r}. "
            "If you set num_predict, try a higher value (>= 128)."
        )

    # Ollama returns timings in nanoseconds.
    total_ns = int(data.get("total_duration", 0))

    return GenerateResult(
        output=output,
        model=data.get("model", model),
        duration_ms=total_ns // 1_000_000,
        prompt_eval_count=data.get("prompt_eval_count"),
        eval_count=data.get("eval_count"),
    )

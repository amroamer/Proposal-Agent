"""LLM utility endpoints — exposes the host Ollama's available models so the
frontend doesn't have to hardcode a list."""
import logging

from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser
from app.schemas.review import OllamaModel, OllamaModelsResponse
from app.services import ollama_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/llm", tags=["llm"])


@router.get(
    "/models",
    response_model=OllamaModelsResponse,
    summary="List models available on the host Ollama (proxies /api/tags)",
)
async def list_models(_user: CurrentUser):
    try:
        raw = await ollama_service.list_models()
    except ollama_service.OllamaError as e:
        logger.warning("Could not reach Ollama: %s", e)
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach the local LLM service: {e}",
        )
    out: list[OllamaModel] = []
    for m in raw:
        details = m.get("details") or {}
        out.append(
            OllamaModel(
                name=m.get("name") or m.get("model") or "",
                parameter_size=details.get("parameter_size"),
                family=details.get("family"),
                size_bytes=m.get("size"),
            )
        )
    return OllamaModelsResponse(models=out)

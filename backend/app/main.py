"""FastAPI application factory for Proposal Agent."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.config import get_settings
from app.api.v1 import api_router as api_v1_router
from app.core.bootstrap import bootstrap_first_admin
from app.core.exceptions import register_exception_handlers

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s (%s)", settings.APP_NAME, settings.ENVIRONMENT)
    await bootstrap_first_admin()
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="AI-powered consulting proposal generation platform.",
    default_response_class=ORJSONResponse,
    docs_url=f"{settings.APP_BASE_PATH}/api/docs" if not settings.is_production else None,
    redoc_url=f"{settings.APP_BASE_PATH}/api/redoc" if not settings.is_production else None,
    openapi_url=f"{settings.APP_BASE_PATH}/api/openapi.json",
    lifespan=lifespan,
)

# CORS — in prod, same-origin via Nginx, so this is mostly a dev convenience
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

# Health / readiness (unversioned, always on)
@app.get(f"{settings.APP_BASE_PATH}/api/health", tags=["health"])
async def health():
    return {"status": "ok", "app": settings.APP_NAME}


@app.get(f"{settings.APP_BASE_PATH}/api/ready", tags=["health"])
async def ready():
    # Phase 1: basic. Deeper checks (DB, Redis, Ollama) added as modules come online.
    return {"status": "ready"}


# Versioned API
app.include_router(api_v1_router, prefix=f"{settings.APP_BASE_PATH}/api/v1")

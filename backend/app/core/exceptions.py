"""Standardized error envelope and exception handlers."""
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def _envelope(code: str, message: str, details=None):
    return {"error": {"code": code, "message": message, "details": details}}


def register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return ORJSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                code=getattr(exc, "code", "http_error"),
                message=exc.detail if isinstance(exc.detail, str) else "HTTP error",
                details=exc.detail if not isinstance(exc.detail, str) else None,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return ORJSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope(
                code="validation_error",
                message="Request body failed validation.",
                details=exc.errors(),
            ),
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return ORJSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=_envelope(code="bad_request", message=str(exc)),
        )

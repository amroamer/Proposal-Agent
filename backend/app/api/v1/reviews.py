"""Proposal review endpoints: upload + framework(s)/prompt -> AI review,
plus a metadata-extract helper used by the review page to pre-fill fields
from the uploaded document.

Includes a streaming SSE endpoint (POST /reviews/stream) that evaluates each
criterion independently and yields results as they complete.
"""
import json
import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser, DbSession
from app.schemas.review import (
    MetadataExtractResponse,
    ReviewDetail,
    ReviewListResponse,
    ReviewMetadata,
    ReviewSummary,
)
from app.services import (
    file_parser_service,
    framework_service,
    ollama_service,
    review_service,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reviews", tags=["reviews"])

VALID_DOC_CLASSES = {"proposal", "deliverable", "presentation"}


def _parse_int_list(raw: str | None) -> list[int]:
    if not raw or not raw.strip():
        return []
    cleaned = raw.strip()
    # Accept JSON array string OR comma-separated.
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return [int(x) for x in parsed if str(x).strip()]
    except (ValueError, TypeError):
        pass
    return [int(p.strip()) for p in cleaned.split(",") if p.strip()]


def _parse_str_list(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    cleaned = raw.strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except (ValueError, TypeError):
        pass
    return [p.strip() for p in cleaned.split(",") if p.strip()]


def _parse_metadata(raw: str | None) -> dict:
    if not raw or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except (ValueError, TypeError):
        pass
    return {}


@router.post(
    "/extract-metadata",
    response_model=MetadataExtractResponse,
    summary="Run the LLM over an uploaded file and return structured metadata",
)
async def extract_metadata(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(..., description="Source proposal: .pptx, .docx, or .pdf"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        meta = await review_service.extract_metadata(
            filename=file.filename, file_bytes=raw, db=db, user=user,
        )
    except file_parser_service.UnsupportedFile as e:
        raise HTTPException(status_code=415, detail=str(e))
    except file_parser_service.FileTooLarge as e:
        raise HTTPException(status_code=413, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ollama_service.OllamaError as e:
        logger.exception("Ollama failure during metadata extract")
        raise HTTPException(
            status_code=502,
            detail=f"AI service unavailable: {e}",
        )
    return MetadataExtractResponse(metadata=ReviewMetadata(**meta))


@router.post(
    "",
    response_model=ReviewDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a .pptx/.docx/.pdf and get an AI review",
)
async def create_review(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(..., description="Source proposal: .pptx, .docx, or .pdf"),
    framework_ids: str | None = Form(
        None,
        description="JSON array or CSV of framework IDs to evaluate against.",
    ),
    framework_id: int | None = Form(
        None,
        description="(Legacy) single framework ID. Prefer framework_ids.",
    ),
    disabled_criteria: str | None = Form(
        None,
        description="JSON array or CSV of criterion names the user disabled before running.",
    ),
    prompt: str | None = Form(
        None,
        description="Free-form review brief / additional notes.",
        max_length=4000,
    ),
    metadata: str | None = Form(
        None,
        description="JSON object of editable document metadata (title/client/date/...).",
    ),
    document_class: str = Form("proposal"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if document_class not in VALID_DOC_CLASSES:
        raise HTTPException(
            status_code=422,
            detail=f"document_class must be one of {sorted(VALID_DOC_CLASSES)}",
        )

    # Resolve framework list: prefer framework_ids, fall back to legacy framework_id.
    ids = _parse_int_list(framework_ids)
    if not ids and framework_id is not None:
        ids = [framework_id]

    if not ids and not (prompt and prompt.strip()):
        raise HTTPException(
            status_code=400,
            detail="Provide at least one framework_id or a free-form prompt.",
        )

    fw_objects = []
    for fid in ids:
        fw = await framework_service.get_visible(db, user=user, framework_id=fid)
        if not fw:
            raise HTTPException(
                status_code=404, detail=f"Framework {fid} not found or not visible."
            )
        if not fw.criteria:
            raise HTTPException(
                status_code=422,
                detail=f"Framework '{fw.name}' has no criteria defined yet.",
            )
        fw_objects.append(fw)

    disabled_list = _parse_str_list(disabled_criteria)
    metadata_dict = _parse_metadata(metadata)

    try:
        row = await review_service.run_review(
            db,
            user=user,
            filename=file.filename,
            file_bytes=raw,
            review_prompt=prompt,
            frameworks=fw_objects,
            disabled_criteria=disabled_list,
            metadata=metadata_dict,
            document_class=document_class,
        )
    except file_parser_service.UnsupportedFile as e:
        raise HTTPException(status_code=415, detail=str(e))
    except file_parser_service.FileTooLarge as e:
        raise HTTPException(status_code=413, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ollama_service.OllamaError as e:
        logger.exception("Ollama failure during review")
        raise HTTPException(
            status_code=502, detail=f"AI review service unavailable: {e}"
        )
    return row


@router.post(
    "/stream",
    summary="Stream an AI review per-criterion via SSE",
    response_class=StreamingResponse,
)
async def create_review_stream(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(..., description="Source proposal: .pptx, .docx, or .pdf"),
    framework_ids: str | None = Form(
        None,
        description="JSON array or CSV of framework IDs to evaluate against.",
    ),
    framework_id: int | None = Form(
        None,
        description="(Legacy) single framework ID. Prefer framework_ids.",
    ),
    disabled_criteria: str | None = Form(
        None,
        description="JSON array or CSV of criterion names the user disabled.",
    ),
    prompt: str | None = Form(None, max_length=4000),
    metadata: str | None = Form(None),
    document_class: str = Form("proposal"),
):
    """Same parameters as POST /reviews but returns an SSE stream that emits
    per-criterion results as they complete."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if document_class not in VALID_DOC_CLASSES:
        raise HTTPException(
            status_code=422,
            detail=f"document_class must be one of {sorted(VALID_DOC_CLASSES)}",
        )

    ids = _parse_int_list(framework_ids)
    if not ids and framework_id is not None:
        ids = [framework_id]
    if not ids:
        raise HTTPException(
            status_code=400,
            detail="Streaming review requires at least one framework.",
        )

    fw_objects = []
    for fid in ids:
        fw = await framework_service.get_visible(db, user=user, framework_id=fid)
        if not fw:
            raise HTTPException(
                status_code=404, detail=f"Framework {fid} not found or not visible."
            )
        if not fw.criteria:
            raise HTTPException(
                status_code=422,
                detail=f"Framework '{fw.name}' has no criteria defined yet.",
            )
        fw_objects.append(fw)

    disabled_list = _parse_str_list(disabled_criteria)
    metadata_dict = _parse_metadata(metadata)

    async def event_generator():
        try:
            async for event in review_service.run_review_streaming(
                db,
                user=user,
                filename=file.filename,
                file_bytes=raw,
                review_prompt=prompt,
                frameworks=fw_objects,
                disabled_criteria=disabled_list,
                metadata=metadata_dict,
                document_class=document_class,
            ):
                event_type = event["event"]
                data = json.dumps(event["data"])
                yield f"event: {event_type}\ndata: {data}\n\n"
        except Exception as e:
            logger.exception("SSE stream error")
            error_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("", response_model=ReviewListResponse, summary="List your past reviews")
async def list_reviews(
    db: DbSession,
    user: CurrentUser,
    limit: int = 50,
    offset: int = 0,
):
    rows, total = await review_service.list_for_user(
        db, user=user, limit=min(limit, 200), offset=max(offset, 0)
    )
    items = [ReviewSummary(**review_service.to_summary_dict(r)) for r in rows]
    return ReviewListResponse(items=items, total=total)


@router.get("/{review_id}", response_model=ReviewDetail, summary="Get a single review")
async def get_review(review_id: int, db: DbSession, user: CurrentUser):
    row = await review_service.get_for_user(db, user=user, review_id=review_id)
    if not row:
        raise HTTPException(status_code=404, detail="Review not found.")
    return row

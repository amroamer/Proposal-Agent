"""Template CRUD endpoints."""
from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.template import (
    TemplateCreate,
    TemplateListResponse,
    TemplateResponse,
    TemplateUpdate,
)
from app.services import template_service

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    db: DbSession,
    user: CurrentUser,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    rows, total = await template_service.list_items(
        db, search=search, limit=min(limit, 200), offset=max(offset, 0)
    )
    return TemplateListResponse(
        items=[TemplateResponse.model_validate(r) for r in rows], total=total
    )


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(req: TemplateCreate, db: DbSession, user: CurrentUser):
    return await template_service.create(db, user=user, req=req)


@router.get("/{item_id}", response_model=TemplateResponse)
async def get_template(item_id: int, db: DbSession, user: CurrentUser):
    item = await template_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found.")
    return item


@router.patch("/{item_id}", response_model=TemplateResponse)
async def update_template(item_id: int, req: TemplateUpdate, db: DbSession, user: CurrentUser):
    item = await template_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found.")
    return await template_service.update(db, item=item, req=req)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(item_id: int, db: DbSession, user: CurrentUser):
    item = await template_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found.")
    await template_service.delete(db, item=item)

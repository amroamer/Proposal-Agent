"""Knowledge-base CRUD endpoints."""
from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.kb import KBCreate, KBListResponse, KBResponse, KBUpdate
from app.services import kb_service

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


@router.get("", response_model=KBListResponse)
async def list_kb(
    db: DbSession,
    user: CurrentUser,
    search: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    rows, total = await kb_service.list_items(
        db,
        search=search,
        category=category,
        tag=tag,
        limit=min(limit, 200),
        offset=max(offset, 0),
    )
    return KBListResponse(items=[KBResponse.model_validate(r) for r in rows], total=total)


@router.get("/categories", response_model=list[str])
async def list_categories(db: DbSession, user: CurrentUser):
    return await kb_service.categories(db)


@router.post("", response_model=KBResponse, status_code=status.HTTP_201_CREATED)
async def create_kb(req: KBCreate, db: DbSession, user: CurrentUser):
    return await kb_service.create(db, user=user, req=req)


@router.get("/{item_id}", response_model=KBResponse)
async def get_kb(item_id: int, db: DbSession, user: CurrentUser):
    item = await kb_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return item


@router.patch("/{item_id}", response_model=KBResponse)
async def update_kb(item_id: int, req: KBUpdate, db: DbSession, user: CurrentUser):
    item = await kb_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    return await kb_service.update(db, item=item, req=req)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kb(item_id: int, db: DbSession, user: CurrentUser):
    item = await kb_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    await kb_service.delete(db, item=item)

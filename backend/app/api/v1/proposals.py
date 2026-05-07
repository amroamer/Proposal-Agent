"""Proposal CRUD endpoints."""
from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.proposal import (
    ProposalCreate,
    ProposalListResponse,
    ProposalResponse,
    ProposalUpdate,
)
from app.services import proposal_service

router = APIRouter(prefix="/proposals", tags=["proposals"])


@router.get("", response_model=ProposalListResponse)
async def list_proposals(
    db: DbSession,
    user: CurrentUser,
    search: str | None = None,
    status_filter: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    rows, total = await proposal_service.list_items(
        db,
        search=search,
        status=status_filter,
        limit=min(limit, 200),
        offset=max(offset, 0),
    )
    return ProposalListResponse(
        items=[ProposalResponse.model_validate(r) for r in rows], total=total
    )


@router.post("", response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
async def create_proposal(req: ProposalCreate, db: DbSession, user: CurrentUser):
    return await proposal_service.create(db, user=user, req=req)


@router.get("/{item_id}", response_model=ProposalResponse)
async def get_proposal(item_id: int, db: DbSession, user: CurrentUser):
    item = await proposal_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Proposal not found.")
    return item


@router.patch("/{item_id}", response_model=ProposalResponse)
async def update_proposal(item_id: int, req: ProposalUpdate, db: DbSession, user: CurrentUser):
    item = await proposal_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Proposal not found.")
    return await proposal_service.update(db, item=item, req=req)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_proposal(item_id: int, db: DbSession, user: CurrentUser):
    item = await proposal_service.get(db, item_id=item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Proposal not found.")
    await proposal_service.delete(db, item=item)

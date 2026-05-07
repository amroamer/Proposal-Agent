"""Proposal CRUD service."""
from fastapi import HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.proposal import Proposal
from app.models.template import Template
from app.models.user import User
from app.schemas.proposal import ProposalCreate, ProposalUpdate


def _sections_to_db(sections) -> list[dict]:
    return [s.model_dump() if hasattr(s, "model_dump") else dict(s) for s in (sections or [])]


def _seed_sections_from_template(template: Template) -> list[dict]:
    """When a proposal is created from a template, copy heading + default_content
    into the proposal's sections so the user starts from the template's defaults."""
    out = []
    for s in template.sections or []:
        out.append({
            "heading": s.get("heading", ""),
            "content": s.get("default_content", ""),
        })
    return out


async def create(db: AsyncSession, *, user: User, req: ProposalCreate) -> Proposal:
    sections = _sections_to_db(req.sections)

    # If the user picked a template AND didn't supply sections, seed from the template.
    if req.template_id and not sections:
        tq = await db.execute(select(Template).where(Template.id == req.template_id))
        tpl = tq.scalar_one_or_none()
        if not tpl:
            raise HTTPException(status_code=404, detail="Template not found.")
        sections = _seed_sections_from_template(tpl)

    p = Proposal(
        owner_user_id=user.id,
        template_id=req.template_id,
        title=req.title.strip(),
        client_name=(req.client_name or "").strip(),
        status=req.status,
        sections=sections,
        notes=req.notes or "",
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def list_items(
    db: AsyncSession,
    *,
    search: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Proposal], int]:
    base = select(Proposal)
    if search:
        s = f"%{search.lower()}%"
        base = base.where(or_(
            func.lower(Proposal.title).like(s),
            func.lower(Proposal.client_name).like(s),
        ))
    if status:
        base = base.where(Proposal.status == status)

    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(Proposal.updated_at.desc()).limit(limit).offset(offset)
    )
    return list(rows_q.scalars().all()), total


async def get(db: AsyncSession, *, item_id: int) -> Proposal | None:
    q = await db.execute(select(Proposal).where(Proposal.id == item_id))
    return q.scalar_one_or_none()


async def update(db: AsyncSession, *, item: Proposal, req: ProposalUpdate) -> Proposal:
    if req.title is not None:
        item.title = req.title.strip()
    if req.client_name is not None:
        item.client_name = req.client_name.strip()
    if req.template_id is not None:
        item.template_id = req.template_id
    if req.status is not None:
        item.status = req.status
    if req.sections is not None:
        item.sections = _sections_to_db(req.sections)
    if req.notes is not None:
        item.notes = req.notes
    await db.commit()
    await db.refresh(item)
    return item


async def delete(db: AsyncSession, *, item: Proposal) -> None:
    await db.delete(item)
    await db.commit()

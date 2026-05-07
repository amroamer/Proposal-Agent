"""Template CRUD service."""
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.template import Template
from app.models.user import User
from app.schemas.template import TemplateCreate, TemplateUpdate


def _sections_to_db(sections) -> list[dict]:
    return [s.model_dump() if hasattr(s, "model_dump") else dict(s) for s in (sections or [])]


async def create(db: AsyncSession, *, user: User, req: TemplateCreate) -> Template:
    t = Template(
        owner_user_id=user.id,
        name=req.name.strip(),
        description=req.description or "",
        sections=_sections_to_db(req.sections),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


async def list_items(
    db: AsyncSession, *, search: str | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[Template], int]:
    base = select(Template)
    if search:
        s = f"%{search.lower()}%"
        base = base.where(or_(
            func.lower(Template.name).like(s),
            func.lower(Template.description).like(s),
        ))
    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(Template.updated_at.desc()).limit(limit).offset(offset)
    )
    return list(rows_q.scalars().all()), total


async def get(db: AsyncSession, *, item_id: int) -> Template | None:
    q = await db.execute(select(Template).where(Template.id == item_id))
    return q.scalar_one_or_none()


async def update(db: AsyncSession, *, item: Template, req: TemplateUpdate) -> Template:
    if req.name is not None:
        item.name = req.name.strip()
    if req.description is not None:
        item.description = req.description
    if req.sections is not None:
        item.sections = _sections_to_db(req.sections)
    await db.commit()
    await db.refresh(item)
    return item


async def delete(db: AsyncSession, *, item: Template) -> None:
    await db.delete(item)
    await db.commit()

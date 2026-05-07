"""Knowledge-base CRUD service."""
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_base import KnowledgeBaseItem
from app.models.user import User
from app.schemas.kb import KBCreate, KBUpdate


async def create(db: AsyncSession, *, user: User, req: KBCreate) -> KnowledgeBaseItem:
    item = KnowledgeBaseItem(
        owner_user_id=user.id,
        title=req.title.strip(),
        category=req.category.strip().lower() or "general",
        body=req.body,
        tags=[t.strip() for t in req.tags if t and t.strip()],
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def list_items(
    db: AsyncSession,
    *,
    search: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[KnowledgeBaseItem], int]:
    base = select(KnowledgeBaseItem)
    if search:
        s = f"%{search.lower()}%"
        base = base.where(or_(
            func.lower(KnowledgeBaseItem.title).like(s),
            func.lower(KnowledgeBaseItem.body).like(s),
        ))
    if category:
        base = base.where(KnowledgeBaseItem.category == category.lower())
    if tag:
        # JSONB contains: tags @> ["<tag>"]
        base = base.where(KnowledgeBaseItem.tags.op("@>")([tag]))

    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(KnowledgeBaseItem.updated_at.desc()).limit(limit).offset(offset)
    )
    return list(rows_q.scalars().all()), total


async def get(db: AsyncSession, *, item_id: int) -> KnowledgeBaseItem | None:
    q = await db.execute(select(KnowledgeBaseItem).where(KnowledgeBaseItem.id == item_id))
    return q.scalar_one_or_none()


async def update(
    db: AsyncSession, *, item: KnowledgeBaseItem, req: KBUpdate
) -> KnowledgeBaseItem:
    if req.title is not None:
        item.title = req.title.strip()
    if req.category is not None:
        item.category = req.category.strip().lower() or "general"
    if req.body is not None:
        item.body = req.body
    if req.tags is not None:
        item.tags = [t.strip() for t in req.tags if t and t.strip()]
    await db.commit()
    await db.refresh(item)
    return item


async def delete(db: AsyncSession, *, item: KnowledgeBaseItem) -> None:
    await db.delete(item)
    await db.commit()


async def categories(db: AsyncSession) -> list[str]:
    q = await db.execute(
        select(KnowledgeBaseItem.category).distinct().order_by(KnowledgeBaseItem.category)
    )
    return [r[0] for r in q.all()]

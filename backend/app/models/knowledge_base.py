"""KnowledgeBaseItem ORM model — reusable content snippets."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KnowledgeBaseItem(Base):
    __tablename__ = "knowledge_base_items"

    id:            Mapped[int]            = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None]     = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title:         Mapped[str]            = mapped_column(String(300), nullable=False)
    category:      Mapped[str]            = mapped_column(String(100), nullable=False, default="general")
    body:          Mapped[str]            = mapped_column(Text, nullable=False)
    tags:          Mapped[list[str]]      = mapped_column(JSONB, nullable=False, default=list)
    created_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at:    Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<KnowledgeBaseItem id={self.id} title={self.title!r} category={self.category!r}>"

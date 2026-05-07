"""Proposal ORM model — concrete proposal document."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Proposal(Base):
    __tablename__ = "proposals"

    id:            Mapped[int]        = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    template_id:   Mapped[int | None] = mapped_column(ForeignKey("templates.id", ondelete="SET NULL"), nullable=True)
    title:         Mapped[str]        = mapped_column(String(300), nullable=False)
    client_name:   Mapped[str]        = mapped_column(String(200), nullable=False, default="")
    status:        Mapped[str]        = mapped_column(String(32), nullable=False, default="draft")
    sections:      Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    notes:         Mapped[str]        = mapped_column(Text, nullable=False, default="")
    created_at:    Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at:    Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<Proposal id={self.id} title={self.title!r} status={self.status!r}>"

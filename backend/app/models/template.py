"""Template ORM model — reusable proposal skeleton."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Template(Base):
    __tablename__ = "templates"

    id:            Mapped[int]        = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name:          Mapped[str]        = mapped_column(String(200), nullable=False)
    description:   Mapped[str]        = mapped_column(Text, nullable=False, default="")
    sections:      Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    created_at:    Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at:    Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<Template id={self.id} name={self.name!r} sections={len(self.sections or [])}>"

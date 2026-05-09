"""ReviewFramework ORM model — structured review criteria set."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReviewFramework(Base):
    __tablename__ = "review_frameworks"

    id:                  Mapped[int]        = mapped_column(primary_key=True)
    owner_user_id:       Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name:                   Mapped[str]        = mapped_column(String(200), nullable=False)
    persona_instruction:    Mapped[str]        = mapped_column(Text, nullable=False, default="")
    persona_instruction_ar: Mapped[str]        = mapped_column(Text, nullable=False, default="")
    model:                  Mapped[str]        = mapped_column(String(100), nullable=False, default="gemma4:latest")
    is_public:           Mapped[bool]       = mapped_column(Boolean, nullable=False, default=False)
    criteria:            Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    created_at:          Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at:          Mapped[datetime]   = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<ReviewFramework id={self.id} name={self.name!r} criteria={len(self.criteria or [])}>"

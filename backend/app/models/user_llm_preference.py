"""UserLLMPreference ORM model — per-user preferred model + sampling options."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserLLMPreference(Base):
    __tablename__ = "user_llm_preferences"

    user_id:    Mapped[int]               = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    model:      Mapped[str | None]        = mapped_column(String(100), nullable=True)
    options:    Mapped[dict]              = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime]          = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<UserLLMPreference user={self.user_id} model={self.model!r}>"

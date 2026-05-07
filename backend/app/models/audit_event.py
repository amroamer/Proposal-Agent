"""AuditEvent ORM model — append-only audit log (DB trigger blocks UPDATE/DELETE)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id:            Mapped[int]            = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None]     = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action:        Mapped[str]            = mapped_column(String(100), nullable=False)
    entity_type:   Mapped[str | None]     = mapped_column(String(100), nullable=True)
    entity_id:     Mapped[str | None]     = mapped_column(String(100), nullable=True)
    metadata_:     Mapped[dict]           = mapped_column("metadata", JSONB, nullable=False, default=dict)
    ip_address:    Mapped[str | None]     = mapped_column(String(45), nullable=True)
    user_agent:    Mapped[str | None]     = mapped_column(String(500), nullable=True)
    occurred_at:   Mapped[datetime]       = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<AuditEvent id={self.id} action={self.action!r}>"

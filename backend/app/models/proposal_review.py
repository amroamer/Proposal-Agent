"""ProposalReview ORM model — AI-driven review of an uploaded proposal."""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProposalReview(Base):
    __tablename__ = "proposal_reviews"

    id:                Mapped[int]      = mapped_column(primary_key=True)
    created_by:        Mapped[int]      = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    source_filename:   Mapped[str]      = mapped_column(String(500), nullable=False)
    source_kind:       Mapped[str]      = mapped_column(String(16), nullable=False)
    source_size_bytes: Mapped[int]      = mapped_column(Integer, nullable=False)
    extracted_text:    Mapped[str]      = mapped_column(Text, nullable=False)
    prompt:            Mapped[str]      = mapped_column(Text, nullable=False)
    review_output:     Mapped[str]      = mapped_column(Text, nullable=False)
    model:             Mapped[str]      = mapped_column(String(100), nullable=False)
    duration_ms:       Mapped[int]      = mapped_column(Integer, nullable=False)

    # Added by V008
    extracted_metadata: Mapped[dict]      = mapped_column(JSONB, nullable=False, default=dict)
    framework_ids:      Mapped[list[int]] = mapped_column(ARRAY(BigInteger), nullable=False, default=list)
    disabled_criteria:  Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    document_class:     Mapped[str]       = mapped_column(String(32), nullable=False, default="proposal")

    created_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at:        Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<ProposalReview id={self.id} kind={self.source_kind} file={self.source_filename!r}>"

"""Dossier ORM model — cached per-section facts sheet for a proposal.

Each row is one extracted dossier for a specific (proposal, source bytes,
model) combination. The pipeline keys cache hits off `source_hash`
(sha256 of the .pptx) + `model` so re-uploading the same file does NOT
re-run extraction, and switching the extraction model produces a new
row instead of overwriting the previous one.

`dossier_json` is the JSONB-serialised form of
`app.services.proposal_review.dossier_schemas.Dossier`.
"""
from datetime import datetime

from sqlalchemy import CHAR, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Dossier(Base):
    __tablename__ = "dossiers"
    __table_args__ = (
        UniqueConstraint("proposal_id", "source_hash", "model", name="dossiers_unique_key"),
    )

    id:           Mapped[int]      = mapped_column(primary_key=True)
    proposal_id:  Mapped[int]      = mapped_column(
        ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_hash:  Mapped[str]      = mapped_column(CHAR(64), nullable=False, index=True)
    model:        Mapped[str]      = mapped_column(String(100), nullable=False)
    dossier_json: Mapped[dict]     = mapped_column(JSONB, nullable=False)
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at:   Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at:   Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<Dossier id={self.id} proposal_id={self.proposal_id} "
            f"hash={self.source_hash[:8]}… model={self.model!r}>"
        )

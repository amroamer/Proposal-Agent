"""ProposalCriterionReview ORM model — granular per-criterion result.

One row per (proposal, framework, criterion, run). The framework runner
batches LLM calls by `group` and writes N rows in one transaction (one
per criterion in the group).

Distinct from `proposal_reviews` (legacy single-blob Markdown output);
co-existing because the legacy upload + free-form review feature still
ships and runs against the same data.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProposalCriterionReview(Base):
    __tablename__ = "proposal_criterion_reviews"

    id:                Mapped[int]      = mapped_column(primary_key=True)
    proposal_id:       Mapped[int]      = mapped_column(
        ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    framework_id:      Mapped[int]      = mapped_column(
        ForeignKey("review_frameworks.id", ondelete="CASCADE"), nullable=False
    )
    criterion_id:      Mapped[str]      = mapped_column(String(100), nullable=False)
    score:             Mapped[int]      = mapped_column(Integer, nullable=False)
    score_label:       Mapped[str]      = mapped_column(String(8), nullable=False)
    evidence:          Mapped[str]      = mapped_column(Text, nullable=False, default="")
    gaps:              Mapped[list]     = mapped_column(JSONB, nullable=False, default=list)
    slides_referenced: Mapped[list[int]] = mapped_column(JSONB, nullable=False, default=list)
    language_used:     Mapped[str]      = mapped_column(String(2), nullable=False, default="ar")
    created_at:        Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at:        Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<ProposalCriterionReview id={self.id} proposal_id={self.proposal_id} "
            f"criterion_id={self.criterion_id!r} score={self.score} "
            f"label={self.score_label!r}>"
        )

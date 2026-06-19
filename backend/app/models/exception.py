"""Exception Resolution Center models.

Instead of a flat list of failed/low-confidence documents, failures are clustered
by a deterministic *root-cause signature* so the biggest systemic problems surface
first and can be fixed once and applied to the whole group.
"""
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ExceptionGroup(Base):
    __tablename__ = "exception_groups"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    # Deterministic fingerprint that groups documents sharing the same root cause.
    root_cause_signature: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    root_cause_label: Mapped[str] = mapped_column(String(512), nullable=False)
    # low_confidence / unclassified / missing_field / ocr_failure / duplicate /
    # timeout / vendor_format_change
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    affected_field: Mapped[str | None] = mapped_column(String(128), nullable=True)
    doc_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vendor_hint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # open / investigating / resolved / ignored
    status: Mapped[str] = mapped_column(
        String(32), default="open", server_default="open", index=True
    )
    document_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    members: Mapped[list["ExceptionGroupMember"]] = relationship(
        back_populates="group", lazy="selectin", cascade="all, delete-orphan"
    )


class ExceptionGroupMember(Base):
    __tablename__ = "exception_group_members"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    exception_group_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exception_groups.id", ondelete="CASCADE"),
        index=True,
    )
    document_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group: Mapped["ExceptionGroup"] = relationship(
        back_populates="members", lazy="selectin"
    )

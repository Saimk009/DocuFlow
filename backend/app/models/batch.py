from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    workflow_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    priority: Mapped[str] = mapped_column(
        String(16), default="normal", server_default="normal"
    )
    status: Mapped[str] = mapped_column(
        String(32), default="pending", server_default="pending"
    )
    doc_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    submitted_by: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

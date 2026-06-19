from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DailyStat(Base):
    __tablename__ = "daily_stats"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    docs_processed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    docs_exceptions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avg_confidence: Mapped[float] = mapped_column(Float, default=0.0, server_default="0")
    avg_processing_ms: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

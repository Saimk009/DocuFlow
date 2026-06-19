from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Robot(Base):
    __tablename__ = "robots"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger_type: Mapped[str] = mapped_column(
        String(16), default="manual", server_default="manual"
    )
    schedule_cron: Mapped[str | None] = mapped_column(String(128), nullable=True)
    definition_json: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default=text("'{}'::json")
    )
    status: Mapped[str] = mapped_column(
        String(32), default="idle", server_default="idle"
    )
    created_by: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    runs: Mapped[list["RobotRun"]] = relationship(
        back_populates="robot", lazy="selectin", cascade="all, delete-orphan"
    )


class RobotRun(Base):
    __tablename__ = "robot_runs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    robot_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("robots.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="running", server_default="running"
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    items_processed: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    logs_json: Mapped[list] = mapped_column(
        JSON, default=list, server_default=text("'[]'::json")
    )

    robot: Mapped["Robot"] = relationship(back_populates="runs", lazy="selectin")

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Connector(Base):
    __tablename__ = "connectors"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    config_enc: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="untested", server_default="untested"
    )
    last_tested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Generic, configurable REST connector engine ─────────────────────────
    # none / api_key / bearer_token / basic / oauth2
    auth_type: Mapped[str] = mapped_column(
        String(32), default="none", server_default="none", nullable=False
    )
    # Encrypted JSON: api key value/placement, bearer/basic creds, oauth tokens, etc.
    auth_config_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # [{ source_field, target_path, transform }]
    field_mappings: Mapped[list] = mapped_column(
        JSON, default=list, server_default=text("'[]'::json")
    )
    # { method, path, headers, body_template }
    request_template: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    trigger_events: Mapped[list] = mapped_column(
        JSON,
        default=lambda: ["document.completed"],
        server_default=text("""'["document.completed"]'::json"""),
    )


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String, nullable=False)
    events: Mapped[list] = mapped_column(
        JSON, default=list, server_default=text("'[]'::json")
    )
    secret: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )

from sqlalchemy import JSON, Boolean, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IndustryTemplate(Base):
    """Platform-wide reference data: prebuilt, ready-to-publish IDP setups.

    Not tenant-scoped — these rows are seeded once and shared across every
    organization. They power the onboarding wizard's "pick your industry"
    step and are cloned into per-tenant Workflows during setup.
    """

    __tablename__ = "industry_templates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    icon: Mapped[str] = mapped_column(String(64), nullable=False)
    doc_types: Mapped[list] = mapped_column(
        JSON, default=list, server_default=text("'[]'::json")
    )
    default_fields: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default=text("'{}'::json")
    )
    default_workflow_json: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default=text("'{}'::json")
    )
    sample_document_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true")
    )

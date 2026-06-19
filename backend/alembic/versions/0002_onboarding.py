"""onboarding: industry templates + tenant onboarding columns

Revision ID: 0002_onboarding
Revises: 0001_initial
Create Date: 2026-06-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_onboarding"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "industry_templates",
        sa.Column(
            "id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("key", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(512), nullable=False),
        sa.Column("icon", sa.String(64), nullable=False),
        sa.Column("doc_types", sa.JSON(), server_default=sa.text("'[]'::json")),
        sa.Column("default_fields", sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column(
            "default_workflow_json", sa.JSON(), server_default=sa.text("'{}'::json")
        ),
        sa.Column("sample_document_url", sa.String(), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
    )
    op.create_index(
        "ix_industry_templates_key", "industry_templates", ["key"], unique=True
    )

    op.add_column(
        "tenants",
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "tenants",
        sa.Column("onboarding_template_key", sa.String(64), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("onboarding_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "onboarding_started_at")
    op.drop_column("tenants", "onboarding_template_key")
    op.drop_column("tenants", "onboarding_completed")
    op.drop_index("ix_industry_templates_key", table_name="industry_templates")
    op.drop_table("industry_templates")

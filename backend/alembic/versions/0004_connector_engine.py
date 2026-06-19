"""configurable connector engine: extended connector columns + execution logs

Revision ID: 0004_connector_engine
Revises: 0003_exception_center
Create Date: 2026-06-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_connector_engine"
down_revision: Union[str, None] = "0003_exception_center"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "connectors",
        sa.Column(
            "auth_type",
            sa.String(32),
            server_default=sa.text("'none'"),
            nullable=False,
        ),
    )
    op.add_column("connectors", sa.Column("auth_config_enc", sa.String(), nullable=True))
    op.add_column("connectors", sa.Column("base_url", sa.String(), nullable=True))
    op.add_column(
        "connectors",
        sa.Column(
            "field_mappings", sa.JSON(), server_default=sa.text("'[]'::json")
        ),
    )
    op.add_column(
        "connectors", sa.Column("request_template", sa.JSON(), nullable=True)
    )
    op.add_column(
        "connectors",
        sa.Column(
            "trigger_events",
            sa.JSON(),
            server_default=sa.text("""'["document.completed"]'::json"""),
        ),
    )

    op.create_table(
        "connector_execution_logs",
        sa.Column(
            "id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "connector_id",
            UUID,
            sa.ForeignKey("connectors.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            UUID,
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "request_summary", sa.JSON(), server_default=sa.text("'{}'::json")
        ),
        sa.Column("response_status", sa.Integer(), nullable=True),
        sa.Column("response_body_truncated", sa.Text(), nullable=True),
        sa.Column(
            "success", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column(
            "duration_ms", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_connector_execution_logs_connector_id",
        "connector_execution_logs",
        ["connector_id"],
    )
    op.create_index(
        "ix_connector_execution_logs_document_id",
        "connector_execution_logs",
        ["document_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_connector_execution_logs_document_id",
        table_name="connector_execution_logs",
    )
    op.drop_index(
        "ix_connector_execution_logs_connector_id",
        table_name="connector_execution_logs",
    )
    op.drop_table("connector_execution_logs")

    op.drop_column("connectors", "trigger_events")
    op.drop_column("connectors", "request_template")
    op.drop_column("connectors", "field_mappings")
    op.drop_column("connectors", "base_url")
    op.drop_column("connectors", "auth_config_enc")
    op.drop_column("connectors", "auth_type")

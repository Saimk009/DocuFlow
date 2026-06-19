"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-18

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")
    )


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.create_table(
        "tenants",
        _uuid_pk(),
        sa.Column("slug", sa.String(63), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("plan", sa.String(32), server_default="free", nullable=False),
        sa.Column("ai_provider", sa.String(32), server_default="claude", nullable=False),
        sa.Column("ai_api_key_enc", sa.String(), nullable=True),
        sa.Column("logo_url", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(16), server_default="member", nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "invitations",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), server_default="member", nullable=False),
        sa.Column("token", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invitations_tenant_id", "invitations", ["tenant_id"])
    op.create_index("ix_invitations_email", "invitations", ["email"])
    op.create_index("ix_invitations_token", "invitations", ["token"])

    op.create_table(
        "batches",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("workflow_id", UUID, nullable=True),
        sa.Column("priority", sa.String(16), server_default="normal", nullable=False),
        sa.Column("status", sa.String(32), server_default="pending", nullable=False),
        sa.Column("doc_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("submitted_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_batches_tenant_id", "batches", ["tenant_id"])

    op.create_table(
        "workflows",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column("definition_json", sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_workflows_tenant_id", "workflows", ["tenant_id"])

    op.create_table(
        "documents",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("batch_id", UUID, sa.ForeignKey("batches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("file_type", sa.String(32), nullable=False),
        sa.Column("page_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(32), server_default="captured", nullable=False),
        sa.Column("doc_type", sa.String(64), nullable=True),
        sa.Column("workflow_id", UUID, sa.ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_to", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_tenant_id", "documents", ["tenant_id"])

    op.create_table(
        "document_fields",
        _uuid_pk(),
        sa.Column("document_id", UUID, sa.ForeignKey("documents.id", ondelete="CASCADE")),
        sa.Column("field_key", sa.String(128), nullable=False),
        sa.Column("field_label", sa.String(255), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=False),
        sa.Column("validated_value", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), server_default="0", nullable=False),
        sa.Column("is_validated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("validator_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_document_fields_document_id", "document_fields", ["document_id"])

    op.create_table(
        "document_events",
        _uuid_pk(),
        sa.Column("document_id", UUID, sa.ForeignKey("documents.id", ondelete="CASCADE")),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("actor_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metadata", sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_events_document_id", "document_events", ["document_id"])

    op.create_table(
        "workflow_runs",
        _uuid_pk(),
        sa.Column("workflow_id", UUID, sa.ForeignKey("workflows.id", ondelete="CASCADE")),
        sa.Column("document_id", UUID, sa.ForeignKey("documents.id", ondelete="CASCADE")),
        sa.Column("current_step", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(32), server_default="running", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_workflow_runs_workflow_id", "workflow_runs", ["workflow_id"])
    op.create_index("ix_workflow_runs_document_id", "workflow_runs", ["document_id"])

    op.create_table(
        "robots",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("trigger_type", sa.String(16), server_default="manual", nullable=False),
        sa.Column("schedule_cron", sa.String(128), nullable=True),
        sa.Column("definition_json", sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column("status", sa.String(32), server_default="idle", nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_robots_tenant_id", "robots", ["tenant_id"])

    op.create_table(
        "robot_runs",
        _uuid_pk(),
        sa.Column("robot_id", UUID, sa.ForeignKey("robots.id", ondelete="CASCADE")),
        sa.Column("status", sa.String(32), server_default="running", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("items_processed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("logs_json", sa.JSON(), server_default=sa.text("'[]'::json")),
    )
    op.create_index("ix_robot_runs_robot_id", "robot_runs", ["robot_id"])

    op.create_table(
        "cases",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), server_default="open", nullable=False),
        sa.Column("priority", sa.String(16), server_default="normal", nullable=False),
        sa.Column("owner_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cases_tenant_id", "cases", ["tenant_id"])

    op.create_table(
        "case_documents",
        _uuid_pk(),
        sa.Column("case_id", UUID, sa.ForeignKey("cases.id", ondelete="CASCADE")),
        sa.Column("document_id", UUID, sa.ForeignKey("documents.id", ondelete="CASCADE")),
    )
    op.create_index("ix_case_documents_case_id", "case_documents", ["case_id"])

    op.create_table(
        "case_tasks",
        _uuid_pk(),
        sa.Column("case_id", UUID, sa.ForeignKey("cases.id", ondelete="CASCADE")),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("assignee_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("is_done", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_case_tasks_case_id", "case_tasks", ["case_id"])

    op.create_table(
        "case_notes",
        _uuid_pk(),
        sa.Column("case_id", UUID, sa.ForeignKey("cases.id", ondelete="CASCADE")),
        sa.Column("author_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_case_notes_case_id", "case_notes", ["case_id"])

    op.create_table(
        "daily_stats",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("docs_processed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("docs_exceptions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("avg_confidence", sa.Float(), server_default="0", nullable=False),
        sa.Column("avg_processing_ms", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_daily_stats_tenant_id", "daily_stats", ["tenant_id"])
    op.create_index("ix_daily_stats_date", "daily_stats", ["date"])

    op.create_table(
        "connectors",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config_enc", sa.String(), nullable=False),
        sa.Column("status", sa.String(32), server_default="untested", nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_connectors_tenant_id", "connectors", ["tenant_id"])

    op.create_table(
        "webhooks",
        _uuid_pk(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("events", sa.JSON(), server_default=sa.text("'[]'::json")),
        sa.Column("secret", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_index("ix_webhooks_tenant_id", "webhooks", ["tenant_id"])


def downgrade() -> None:
    for table in [
        "webhooks",
        "connectors",
        "daily_stats",
        "case_notes",
        "case_tasks",
        "case_documents",
        "cases",
        "robot_runs",
        "robots",
        "workflow_runs",
        "document_events",
        "document_fields",
        "documents",
        "workflows",
        "batches",
        "invitations",
        "users",
        "tenants",
    ]:
        op.drop_table(table)

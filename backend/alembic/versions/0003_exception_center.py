"""exception resolution center: root-cause groups + members

Revision ID: 0003_exception_center
Revises: 0002_onboarding
Create Date: 2026-06-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_exception_center"
down_revision: Union[str, None] = "0002_onboarding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "exception_groups",
        sa.Column(
            "id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "tenant_id",
            UUID,
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("root_cause_signature", sa.String(512), nullable=False),
        sa.Column("root_cause_label", sa.String(512), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("affected_field", sa.String(128), nullable=True),
        sa.Column("doc_type", sa.String(64), nullable=True),
        sa.Column("vendor_hint", sa.String(255), nullable=True),
        sa.Column(
            "status", sa.String(32), server_default=sa.text("'open'"), nullable=False
        ),
        sa.Column(
            "document_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column(
            "resolved_by",
            UUID,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_exception_groups_tenant_id", "exception_groups", ["tenant_id"]
    )
    op.create_index(
        "ix_exception_groups_root_cause_signature",
        "exception_groups",
        ["root_cause_signature"],
    )
    op.create_index("ix_exception_groups_category", "exception_groups", ["category"])
    op.create_index("ix_exception_groups_status", "exception_groups", ["status"])

    op.create_table(
        "exception_group_members",
        sa.Column(
            "id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "exception_group_id",
            UUID,
            sa.ForeignKey("exception_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            UUID,
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_exception_group_members_exception_group_id",
        "exception_group_members",
        ["exception_group_id"],
    )
    op.create_index(
        "ix_exception_group_members_document_id",
        "exception_group_members",
        ["document_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_exception_group_members_document_id",
        table_name="exception_group_members",
    )
    op.drop_index(
        "ix_exception_group_members_exception_group_id",
        table_name="exception_group_members",
    )
    op.drop_table("exception_group_members")

    op.drop_index("ix_exception_groups_status", table_name="exception_groups")
    op.drop_index("ix_exception_groups_category", table_name="exception_groups")
    op.drop_index(
        "ix_exception_groups_root_cause_signature", table_name="exception_groups"
    )
    op.drop_index("ix_exception_groups_tenant_id", table_name="exception_groups")
    op.drop_table("exception_groups")

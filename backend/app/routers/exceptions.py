"""Exception Resolution Center (/api/v1/exceptions).

Failed and low-confidence documents are presented as *root-cause groups* rather
than a flat list: the biggest systemic problems surface first, each comes with an
AI-suggested fix, and a correction can be applied once across the whole group.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.document import Document, DocumentEvent, DocumentField
from app.models.exception import ExceptionGroup, ExceptionGroupMember
from app.models.user import User
from app.services.exception_clustering_service import exception_clustering_service

router = APIRouter(prefix="/api/v1/exceptions", tags=["exceptions"])

_OPEN_STATUSES = ("open", "investigating")


# ── Schemas ────────────────────────────────────────────────────────────────
class GroupSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    root_cause_label: str
    category: str
    status: str
    document_count: int
    affected_field: str | None = None
    doc_type: str | None = None
    vendor_hint: str | None = None
    first_seen_at: datetime
    last_seen_at: datetime


class MemberDocument(BaseModel):
    id: str
    filename: str
    confidence: float | None = None
    status: str
    submitted_at: datetime


class Suggestion(BaseModel):
    suggestion: str
    confidence: float


class GroupDetail(GroupSummary):
    resolution_note: str | None = None
    resolved_at: datetime | None = None
    resolved_by: str | None = None
    members: list[MemberDocument]
    suggested_resolution: Suggestion


class BulkResolveRequest(BaseModel):
    action: Literal["approve_all", "reject_all", "reassign_all"]
    field_corrections: dict[str, str] | None = None
    assigned_to: str | None = None
    note: str | None = None
    # Optional subset — if a few documents in the group are actually different,
    # the UI can exclude them and pass only the ones to act on.
    document_ids: list[str] | None = None


class MessageResponse(BaseModel):
    message: str
    affected_documents: int


class CategoryCount(BaseModel):
    category: str
    count: int


class TrendPoint(BaseModel):
    date: str
    count: int


class SummaryResponse(BaseModel):
    total_open_groups: int
    total_affected_docs: int
    resolved_this_week: int
    avg_resolution_seconds: float | None
    top_3_categories: list[CategoryCount]
    trend_7d: list[TrendPoint]


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _get_owned_group(
    group_id: str, user: User, db: AsyncSession
) -> ExceptionGroup:
    group = await db.get(ExceptionGroup, group_id)
    if group is None or str(group.tenant_id) != str(user.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exception group not found."
        )
    return group


def _avg_confidence(doc: Document) -> float | None:
    if not doc.fields:
        return None
    return round(sum(f.confidence for f in doc.fields) / len(doc.fields), 4)


async def _load_members(
    db: AsyncSession, group_id: str
) -> list[Document]:
    rows = await db.execute(
        select(Document)
        .join(ExceptionGroupMember, ExceptionGroupMember.document_id == Document.id)
        .where(ExceptionGroupMember.exception_group_id == group_id)
        .order_by(Document.created_at.desc())
    )
    return list(rows.scalars().all())


def _to_summary(group: ExceptionGroup) -> GroupSummary:
    return GroupSummary(
        id=str(group.id),
        root_cause_label=group.root_cause_label,
        category=group.category,
        status=group.status,
        document_count=group.document_count or 0,
        affected_field=group.affected_field,
        doc_type=group.doc_type,
        vendor_hint=group.vendor_hint,
        first_seen_at=group.first_seen_at,
        last_seen_at=group.last_seen_at,
    )


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/groups", response_model=list[GroupSummary])
async def list_groups(
    status_filter: str | None = Query(None, alias="status"),
    category: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GroupSummary]:
    """Biggest problems first: sorted by document_count descending."""
    filters = [ExceptionGroup.tenant_id == user.tenant_id]
    if status_filter:
        filters.append(ExceptionGroup.status == status_filter)
    if category:
        filters.append(ExceptionGroup.category == category)

    rows = await db.execute(
        select(ExceptionGroup)
        .where(*filters)
        .order_by(
            ExceptionGroup.document_count.desc(), ExceptionGroup.last_seen_at.desc()
        )
    )
    return [_to_summary(g) for g in rows.scalars().all()]


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SummaryResponse:
    tid = user.tenant_id

    total_open_groups = (
        await db.execute(
            select(func.count())
            .select_from(ExceptionGroup)
            .where(
                ExceptionGroup.tenant_id == tid,
                ExceptionGroup.status.in_(_OPEN_STATUSES),
            )
        )
    ).scalar_one()

    total_affected_docs = (
        await db.execute(
            select(func.coalesce(func.sum(ExceptionGroup.document_count), 0)).where(
                ExceptionGroup.tenant_id == tid,
                ExceptionGroup.status.in_(_OPEN_STATUSES),
            )
        )
    ).scalar_one()

    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    resolved_this_week = (
        await db.execute(
            select(func.count())
            .select_from(ExceptionGroup)
            .where(
                ExceptionGroup.tenant_id == tid,
                ExceptionGroup.status == "resolved",
                ExceptionGroup.resolved_at >= week_ago,
            )
        )
    ).scalar_one()

    avg_resolution_seconds = (
        await db.execute(
            select(
                func.avg(
                    func.extract(
                        "epoch",
                        ExceptionGroup.resolved_at - ExceptionGroup.first_seen_at,
                    )
                )
            ).where(
                ExceptionGroup.tenant_id == tid,
                ExceptionGroup.status == "resolved",
                ExceptionGroup.resolved_at.is_not(None),
            )
        )
    ).scalar_one()

    cat_rows = await db.execute(
        select(
            ExceptionGroup.category,
            func.coalesce(func.sum(ExceptionGroup.document_count), 0),
        )
        .where(
            ExceptionGroup.tenant_id == tid,
            ExceptionGroup.status.in_(_OPEN_STATUSES),
        )
        .group_by(ExceptionGroup.category)
        .order_by(func.coalesce(func.sum(ExceptionGroup.document_count), 0).desc())
        .limit(3)
    )
    top_3 = [CategoryCount(category=c, count=int(n)) for c, n in cat_rows.all()]

    # 7-day trend of newly-clustered documents.
    since = datetime.now(timezone.utc) - timedelta(days=6)
    day_col = func.date(ExceptionGroupMember.created_at)
    trend_rows = await db.execute(
        select(day_col, func.count())
        .join(
            ExceptionGroup,
            ExceptionGroup.id == ExceptionGroupMember.exception_group_id,
        )
        .where(
            ExceptionGroup.tenant_id == tid,
            ExceptionGroupMember.created_at >= since,
        )
        .group_by(day_col)
    )
    counts_by_day = {str(d): int(n) for d, n in trend_rows.all()}
    today = datetime.now(timezone.utc).date()
    trend_7d = [
        TrendPoint(
            date=(today - timedelta(days=offset)).isoformat(),
            count=counts_by_day.get((today - timedelta(days=offset)).isoformat(), 0),
        )
        for offset in range(6, -1, -1)
    ]

    return SummaryResponse(
        total_open_groups=int(total_open_groups),
        total_affected_docs=int(total_affected_docs),
        resolved_this_week=int(resolved_this_week),
        avg_resolution_seconds=(
            float(avg_resolution_seconds)
            if avg_resolution_seconds is not None
            else None
        ),
        top_3_categories=top_3,
        trend_7d=trend_7d,
    )


@router.get("/groups/{group_id}", response_model=GroupDetail)
async def get_group(
    group_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupDetail:
    group = await _get_owned_group(group_id, user, db)
    members = await _load_members(db, group_id)
    suggestion = await exception_clustering_service.suggest_resolution(group_id)

    return GroupDetail(
        **_to_summary(group).model_dump(),
        resolution_note=group.resolution_note,
        resolved_at=group.resolved_at,
        resolved_by=str(group.resolved_by) if group.resolved_by else None,
        members=[
            MemberDocument(
                id=str(d.id),
                filename=d.filename,
                confidence=_avg_confidence(d),
                status=d.status,
                submitted_at=d.created_at,
            )
            for d in members
        ],
        suggested_resolution=Suggestion(**suggestion),
    )


@router.post("/groups/{group_id}/bulk-resolve", response_model=MessageResponse)
async def bulk_resolve(
    group_id: str,
    payload: BulkResolveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    group = await _get_owned_group(group_id, user, db)

    if payload.action == "reassign_all" and not payload.assigned_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="assigned_to is required for reassign_all.",
        )

    members = await _load_members(db, group_id)
    if payload.document_ids:
        wanted = {str(d) for d in payload.document_ids}
        members = [d for d in members if str(d.id) in wanted]
    now = datetime.now(timezone.utc)
    corrections = payload.field_corrections or {}

    for doc in members:
        # "Fix once, apply to all": push the same corrected value across every
        # member document's matching field.
        if corrections:
            for field in doc.fields:
                if field.field_key in corrections:
                    field.validated_value = corrections[field.field_key]
                    field.is_validated = True
                    field.validator_id = user.id
                    field.validated_at = now

        if payload.action == "approve_all":
            doc.status = "complete"
            doc.completed_at = now
        elif payload.action == "reject_all":
            doc.status = "rejected"
        else:  # reassign_all
            doc.assigned_to = payload.assigned_to
            doc.status = "validating"

        db.add(
            DocumentEvent(
                document_id=doc.id,
                event_type="bulk_resolved",
                actor_id=user.id,
                event_metadata={
                    "note": "Bulk-resolved via Exception Center",
                    "action": payload.action,
                    "exception_group_id": str(group.id),
                    "field_corrections": corrections or None,
                },
            )
        )

    group.status = "resolved"
    group.resolved_at = now
    group.resolved_by = user.id
    group.resolution_note = payload.note or f"Bulk {payload.action} via Exception Center"

    await db.commit()
    return MessageResponse(
        message=f"Bulk {payload.action} applied to {len(members)} document(s).",
        affected_documents=len(members),
    )


@router.post("/groups/{group_id}/ignore", response_model=MessageResponse)
async def ignore_group(
    group_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    group = await _get_owned_group(group_id, user, db)
    group.status = "ignored"
    group.resolved_at = datetime.now(timezone.utc)
    group.resolved_by = user.id
    await db.commit()
    return MessageResponse(
        message="Exception group marked as ignored.",
        affected_documents=0,
    )

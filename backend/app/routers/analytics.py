"""Analytics routes (/api/v1/analytics). Tenant-scoped, read-only aggregates."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.analytics import DailyStat
from app.models.document import Document, DocumentEvent
from app.models.robot import Robot, RobotRun
from app.models.user import User
from app.models.workflow import Workflow, WorkflowRun

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


class TodayStats(BaseModel):
    processed: int
    exceptions: int
    avg_confidence: float


class DayStat(BaseModel):
    date: str
    processed: int
    exceptions: int
    avg_confidence: float


class DocTypeStat(BaseModel):
    doc_type: str
    count: int
    pct: float


class SlaStat(BaseModel):
    workflow_name: str
    avg_processing_ms: int
    p95_processing_ms: int


class ExceptionStat(BaseModel):
    reason: str
    count: int


class OverviewResponse(BaseModel):
    today: TodayStats
    last_30_days: list[DayStat]
    by_doc_type: list[DocTypeStat]
    sla: list[SlaStat]
    top_exceptions: list[ExceptionStat]


class RobotStat(BaseModel):
    robot_id: str
    name: str
    runs: int
    success_rate: float
    avg_duration_ms: int


class UserStat(BaseModel):
    user_id: str
    full_name: str
    docs_validated: int
    avg_response_ms: int


class FieldStat(BaseModel):
    field_key: str
    field_label: str
    avg_confidence: float
    sample_count: int
    low_confidence_rate: float


@router.get("/overview", response_model=OverviewResponse)
async def overview(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OverviewResponse:
    tenant_id = user.tenant_id
    today = datetime.now(timezone.utc).date()

    # Today (from pre-aggregated daily_stats, fall back to zeros)
    today_row = (
        await db.execute(
            select(DailyStat).where(
                DailyStat.tenant_id == tenant_id, DailyStat.date == today
            )
        )
    ).scalar_one_or_none()
    today_stats = TodayStats(
        processed=today_row.docs_processed if today_row else 0,
        exceptions=today_row.docs_exceptions if today_row else 0,
        avg_confidence=round(today_row.avg_confidence, 4) if today_row else 0.0,
    )

    # Last 30 days
    since = today - timedelta(days=30)
    rows = (
        await db.execute(
            select(DailyStat)
            .where(DailyStat.tenant_id == tenant_id, DailyStat.date >= since)
            .order_by(DailyStat.date)
        )
    ).scalars().all()
    last_30 = [
        DayStat(
            date=r.date.isoformat(),
            processed=r.docs_processed,
            exceptions=r.docs_exceptions,
            avg_confidence=round(r.avg_confidence, 4),
        )
        for r in rows
    ]

    # By doc type
    type_rows = (
        await db.execute(
            select(Document.doc_type, func.count())
            .where(
                Document.tenant_id == tenant_id,
                Document.is_active.is_(True),
                Document.doc_type.isnot(None),
            )
            .group_by(Document.doc_type)
        )
    ).all()
    total_typed = sum(c for _, c in type_rows) or 1
    by_doc_type = [
        DocTypeStat(doc_type=dt, count=c, pct=round(c / total_typed * 100, 2))
        for dt, c in type_rows
    ]

    # SLA per workflow from workflow_runs durations
    epoch = func.extract("epoch", WorkflowRun.completed_at - WorkflowRun.started_at)
    sla_rows = (
        await db.execute(
            select(
                Workflow.name,
                func.avg(epoch),
                func.percentile_cont(0.95).within_group(epoch.asc()),
            )
            .join(WorkflowRun, WorkflowRun.workflow_id == Workflow.id)
            .where(
                Workflow.tenant_id == tenant_id,
                WorkflowRun.completed_at.isnot(None),
            )
            .group_by(Workflow.name)
        )
    ).all()
    sla = [
        SlaStat(
            workflow_name=name,
            avg_processing_ms=int((avg_s or 0) * 1000),
            p95_processing_ms=int((p95_s or 0) * 1000),
        )
        for name, avg_s, p95_s in sla_rows
    ]

    # Top exceptions from error events
    reason = DocumentEvent.event_metadata["message"].as_string()
    exc_rows = (
        await db.execute(
            select(func.coalesce(reason, "Unknown"), func.count())
            .join(Document, Document.id == DocumentEvent.document_id)
            .where(
                Document.tenant_id == tenant_id,
                DocumentEvent.event_type == "error",
            )
            .group_by(func.coalesce(reason, "Unknown"))
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()
    top_exceptions = [ExceptionStat(reason=r, count=c) for r, c in exc_rows]

    return OverviewResponse(
        today=today_stats,
        last_30_days=last_30,
        by_doc_type=by_doc_type,
        sla=sla,
        top_exceptions=top_exceptions,
    )


@router.get("/robots", response_model=list[RobotStat])
async def robot_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RobotStat]:
    epoch = func.extract("epoch", RobotRun.finished_at - RobotRun.started_at)
    rows = (
        await db.execute(
            select(
                Robot.id,
                Robot.name,
                func.count(RobotRun.id),
                func.sum(case((RobotRun.status == "completed", 1), else_=0)),
                func.avg(epoch),
            )
            .outerjoin(RobotRun, RobotRun.robot_id == Robot.id)
            .where(Robot.tenant_id == user.tenant_id)
            .group_by(Robot.id, Robot.name)
        )
    ).all()
    stats = []
    for rid, name, runs, successes, avg_s in rows:
        runs = runs or 0
        success_rate = round((successes or 0) / runs * 100, 2) if runs else 0.0
        stats.append(
            RobotStat(
                robot_id=str(rid),
                name=name,
                runs=runs,
                success_rate=success_rate,
                avg_duration_ms=int((avg_s or 0) * 1000),
            )
        )
    return stats


@router.get("/fields", response_model=list[FieldStat])
async def field_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FieldStat]:
    """Per-field extraction accuracy aggregated across all documents."""
    from app.models.document import DocumentField

    low = func.sum(case((DocumentField.confidence < 0.7, 1), else_=0))
    rows = (
        await db.execute(
            select(
                DocumentField.field_key,
                func.max(DocumentField.field_label),
                func.avg(DocumentField.confidence),
                func.count(DocumentField.id),
                low,
            )
            .join(Document, Document.id == DocumentField.document_id)
            .where(Document.tenant_id == user.tenant_id)
            .group_by(DocumentField.field_key)
            .order_by(func.count(DocumentField.id).desc())
        )
    ).all()
    return [
        FieldStat(
            field_key=key,
            field_label=label or key,
            avg_confidence=round(float(avg_c or 0), 4),
            sample_count=count or 0,
            low_confidence_rate=round((low_c or 0) / count, 4) if count else 0.0,
        )
        for key, label, avg_c, count, low_c in rows
    ]


@router.get("/users", response_model=list[UserStat])
async def user_activity(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserStat]:
    from app.models.document import DocumentField

    epoch = func.extract(
        "epoch", DocumentField.validated_at - Document.created_at
    )
    rows = (
        await db.execute(
            select(
                User.id,
                User.full_name,
                func.count(DocumentField.id),
                func.avg(epoch),
            )
            .outerjoin(DocumentField, DocumentField.validator_id == User.id)
            .outerjoin(Document, Document.id == DocumentField.document_id)
            .where(User.tenant_id == user.tenant_id)
            .group_by(User.id, User.full_name)
        )
    ).all()
    return [
        UserStat(
            user_id=str(uid),
            full_name=name,
            docs_validated=count or 0,
            avg_response_ms=int((avg_s or 0) * 1000),
        )
        for uid, name, count, avg_s in rows
    ]

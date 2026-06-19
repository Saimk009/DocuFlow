"""Platform super-admin routes (/api/v1/admin). Cross-tenant.

Access is restricted to the configured ``SUPER_ADMIN_EMAIL``.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.document import Document
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

_PROCESS_START = time.monotonic()
# Rough per-page storage estimate (no per-file byte size is persisted).
_BYTES_PER_PAGE = 82_000


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() != settings.SUPER_ADMIN_EMAIL.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super administrator access required.",
        )
    return user


class TenantStats(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    plan: str
    is_active: bool
    created_at: datetime
    user_count: int = 0
    document_count: int = 0
    docs_month: int = 0
    storage_bytes: int = 0


class TenantUpdate(BaseModel):
    plan: str | None = None
    is_active: bool | None = None


class PlatformStats(BaseModel):
    total_tenants: int
    active_tenants: int
    active_today: int
    total_users: int
    docs_today: int
    docs_month: int
    errors_today: int
    storage_bytes: int
    uptime_seconds: int


class PlatformHealth(BaseModel):
    cpu_percent: float
    memory_percent: float
    celery_workers: int
    redis_queue_depth: int
    docs_24h: int
    errors_24h: int
    error_rate_24h: float


class ExceptionEntry(BaseModel):
    id: str
    tenant: str
    doc_type: str | None = None
    reason: str
    created_at: datetime


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _today_start() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/tenants", response_model=list[TenantStats])
async def list_tenants(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TenantStats]:
    tenants = (await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars().all()
    month_start = _month_start()

    user_counts = dict(
        (
            await db.execute(select(User.tenant_id, func.count()).group_by(User.tenant_id))
        ).all()
    )
    doc_counts = dict(
        (
            await db.execute(
                select(Document.tenant_id, func.count()).group_by(Document.tenant_id)
            )
        ).all()
    )
    month_counts = dict(
        (
            await db.execute(
                select(Document.tenant_id, func.count())
                .where(Document.created_at >= month_start)
                .group_by(Document.tenant_id)
            )
        ).all()
    )
    page_sums = dict(
        (
            await db.execute(
                select(Document.tenant_id, func.coalesce(func.sum(Document.page_count), 0))
                .group_by(Document.tenant_id)
            )
        ).all()
    )

    out = []
    for t in tenants:
        item = TenantStats.model_validate(t)
        item.user_count = user_counts.get(t.id, 0)
        item.document_count = doc_counts.get(t.id, 0)
        item.docs_month = month_counts.get(t.id, 0)
        item.storage_bytes = int(page_sums.get(t.id, 0) or 0) * _BYTES_PER_PAGE
        out.append(item)
    return out


@router.get("/tenants/{tenant_id}", response_model=TenantStats)
async def get_tenant(
    tenant_id: str,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> TenantStats:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    item = TenantStats.model_validate(tenant)
    item.user_count = (
        await db.execute(
            select(func.count()).select_from(User).where(User.tenant_id == tenant_id)
        )
    ).scalar_one()
    item.document_count = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.tenant_id == tenant_id)
        )
    ).scalar_one()
    item.docs_month = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.tenant_id == tenant_id, Document.created_at >= _month_start())
        )
    ).scalar_one()
    pages = (
        await db.execute(
            select(func.coalesce(func.sum(Document.page_count), 0)).where(
                Document.tenant_id == tenant_id
            )
        )
    ).scalar_one()
    item.storage_bytes = int(pages or 0) * _BYTES_PER_PAGE
    return item


@router.patch("/tenants/{tenant_id}", response_model=TenantStats)
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdate,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> TenantStats:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    if payload.plan is not None:
        tenant.plan = payload.plan
    if payload.is_active is not None:
        tenant.is_active = payload.is_active
    await db.commit()
    await db.refresh(tenant)
    return TenantStats.model_validate(tenant)


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PlatformStats:
    today_start = _today_start()
    month_start = _month_start()

    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar_one()
    active_tenants = (
        await db.execute(
            select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True))
        )
    ).scalar_one()
    active_today = (
        await db.execute(
            select(func.count(distinct(Document.tenant_id))).where(
                Document.created_at >= today_start
            )
        )
    ).scalar_one()
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    docs_today = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.created_at >= today_start)
        )
    ).scalar_one()
    docs_month = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.created_at >= month_start)
        )
    ).scalar_one()
    errors_today = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.status == "exception", Document.created_at >= today_start)
        )
    ).scalar_one()
    total_pages = (
        await db.execute(select(func.coalesce(func.sum(Document.page_count), 0)))
    ).scalar_one()

    return PlatformStats(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        active_today=active_today,
        total_users=total_users,
        docs_today=docs_today,
        docs_month=docs_month,
        errors_today=errors_today,
        storage_bytes=int(total_pages or 0) * _BYTES_PER_PAGE,
        uptime_seconds=int(time.monotonic() - _PROCESS_START),
    )


def _system_metrics() -> tuple[float, float]:
    """Best-effort CPU/memory percentages (psutil if available)."""
    try:
        import psutil  # type: ignore

        return float(psutil.cpu_percent(interval=0.1)), float(
            psutil.virtual_memory().percent
        )
    except Exception:
        return 0.0, 0.0


def _celery_worker_count() -> int:
    try:
        from app.workers.celery_app import celery_app

        replies = celery_app.control.inspect(timeout=0.4).ping()
        return len(replies or {})
    except Exception:
        return 0


@router.get("/health", response_model=PlatformHealth)
async def platform_health(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PlatformHealth:
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    docs_24h = (
        await db.execute(
            select(func.count()).select_from(Document).where(Document.created_at >= since)
        )
    ).scalar_one()
    errors_24h = (
        await db.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.status == "exception", Document.created_at >= since)
        )
    ).scalar_one()

    cpu, mem = await asyncio.to_thread(_system_metrics)
    workers = await asyncio.to_thread(_celery_worker_count)

    queue_depth = 0
    try:
        from app.utils.redis_client import redis_client

        queue_depth = int(await redis_client.llen("celery"))
    except Exception:
        queue_depth = 0

    rate = round((errors_24h / docs_24h) * 100, 2) if docs_24h else 0.0

    return PlatformHealth(
        cpu_percent=round(cpu, 1),
        memory_percent=round(mem, 1),
        celery_workers=workers,
        redis_queue_depth=queue_depth,
        docs_24h=docs_24h,
        errors_24h=errors_24h,
        error_rate_24h=rate,
    )


@router.get("/exceptions", response_model=list[ExceptionEntry])
async def recent_exceptions(
    limit: int = Query(default=12, ge=1, le=50),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ExceptionEntry]:
    """Recent exceptions across all tenants, with tenant identity anonymized."""
    rows = (
        await db.execute(
            select(
                Document.id,
                Tenant.slug,
                Document.doc_type,
                Document.created_at,
            )
            .join(Tenant, Tenant.id == Document.tenant_id)
            .where(Document.status == "exception")
            .order_by(Document.created_at.desc())
            .limit(limit)
        )
    ).all()

    out: list[ExceptionEntry] = []
    for doc_id, slug, doc_type, created_at in rows:
        masked = f"{slug[:2]}{'*' * max(len(slug) - 2, 1)}" if slug else "tenant"
        out.append(
            ExceptionEntry(
                id=str(doc_id)[:8],
                tenant=masked,
                doc_type=doc_type,
                reason="Extraction confidence below threshold",
                created_at=created_at,
            )
        )
    return out

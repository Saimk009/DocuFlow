"""Batch routes (/api/v1/batches). Tenant-scoped."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.batch import Batch
from app.models.document import Document
from app.models.user import User

router = APIRouter(prefix="/api/v1/batches", tags=["batches"])


class BatchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    workflow_id: str | None = None
    priority: str = "normal"


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    workflow_id: str | None = None
    priority: str
    status: str
    doc_count: int
    submitted_by: str | None = None
    created_at: datetime
    status_summary: dict[str, int] = Field(default_factory=dict)


class BatchListResponse(BaseModel):
    items: list[BatchOut]
    total: int
    page: int
    pages: int


class DocumentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    status: str
    doc_type: str | None = None


class BatchDetail(BatchOut):
    documents: list[DocumentBrief] = Field(default_factory=list)


class MessageResponse(BaseModel):
    message: str


async def _status_summary(db: AsyncSession, batch_id: str) -> dict[str, int]:
    rows = await db.execute(
        select(Document.status, func.count())
        .where(Document.batch_id == batch_id, Document.is_active.is_(True))
        .group_by(Document.status)
    )
    return {status_: count for status_, count in rows.all()}


async def _get_owned_batch(batch_id: str, user: User, db: AsyncSession) -> Batch:
    batch = await db.get(Batch, batch_id)
    if batch is None or str(batch.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    return batch


@router.post("", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
async def create_batch(
    payload: BatchCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchOut:
    batch = Batch(
        tenant_id=user.tenant_id,
        name=payload.name,
        workflow_id=payload.workflow_id,
        priority=payload.priority,
        status="pending",
        submitted_by=user.id,
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return BatchOut.model_validate(batch)


@router.get("", response_model=BatchListResponse)
async def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchListResponse:
    base = select(Batch).where(Batch.tenant_id == user.tenant_id)
    total = (
        await db.execute(
            select(func.count()).select_from(Batch).where(Batch.tenant_id == user.tenant_id)
        )
    ).scalar_one()
    result = await db.execute(
        base.order_by(Batch.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    )
    batches = result.scalars().all()

    items = []
    for b in batches:
        out = BatchOut.model_validate(b)
        out.status_summary = await _status_summary(db, b.id)
        items.append(out)
    pages = (total + page_size - 1) // page_size if total else 0
    return BatchListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/{batch_id}", response_model=BatchDetail)
async def get_batch(
    batch_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchDetail:
    batch = await _get_owned_batch(batch_id, user, db)
    docs = (
        await db.execute(
            select(Document)
            .where(Document.batch_id == batch_id, Document.is_active.is_(True))
            .order_by(Document.created_at.desc())
        )
    ).scalars().all()

    detail = BatchDetail.model_validate(batch)
    detail.status_summary = await _status_summary(db, batch.id)
    detail.documents = [DocumentBrief.model_validate(d) for d in docs]
    return detail


@router.delete("/{batch_id}", response_model=MessageResponse)
async def delete_batch(
    batch_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    batch = await _get_owned_batch(batch_id, user, db)
    await db.delete(batch)
    await db.commit()
    return MessageResponse(message="Batch deleted.")

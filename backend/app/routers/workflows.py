"""Workflow routes (/api/v1/workflows). Tenant-scoped."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.workflow import Workflow

router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])

_VALID_NODE_TYPES = {
    # Original/canonical pipeline stages
    "capture", "classify", "extract", "validate", "decision", "integrate", "notify",
    # Designer palette kinds (triggers / processing / human / logic / actions)
    "file_upload", "email_ingestion", "batch_import",
    "ocr", "approve_reject", "wait", "archive",
}


class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    definition_json: dict[str, Any] = Field(default_factory=dict)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    definition_json: dict[str, Any]


class WorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    status: str
    definition_json: dict[str, Any]
    version: int
    created_by: str | None = None
    published_at: datetime | None = None
    created_at: datetime


class WorkflowListResponse(BaseModel):
    items: list[WorkflowOut]
    total: int
    page: int
    pages: int


class MessageResponse(BaseModel):
    message: str


def _validate_definition(definition: dict[str, Any]) -> None:
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="definition_json must contain 'nodes' and 'edges' arrays.",
        )
    node_ids = set()
    for node in nodes:
        ntype = node.get("type")
        if ntype not in _VALID_NODE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid node type '{ntype}'. Allowed: {', '.join(sorted(_VALID_NODE_TYPES))}.",
            )
        node_ids.add(node.get("id"))
    for edge in edges:
        if edge.get("source") not in node_ids or edge.get("target") not in node_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Each edge must reference existing node ids.",
            )


async def _get_owned_workflow(workflow_id: str, user: User, db: AsyncSession) -> Workflow:
    wf = await db.get(Workflow, workflow_id)
    if wf is None or str(wf.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    return wf


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkflowOut:
    if payload.definition_json:
        _validate_definition(payload.definition_json)
    wf = Workflow(
        tenant_id=user.tenant_id,
        name=payload.name,
        description=payload.description,
        definition_json=payload.definition_json or {"nodes": [], "edges": []},
        status="draft",
        version=1,
        created_by=user.id,
    )
    db.add(wf)
    await db.commit()
    await db.refresh(wf)
    return WorkflowOut.model_validate(wf)


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkflowListResponse:
    filters = [Workflow.tenant_id == user.tenant_id, Workflow.status != "archived"]
    if status_filter:
        filters.append(Workflow.status == status_filter)
    total = (
        await db.execute(select(func.count()).select_from(Workflow).where(*filters))
    ).scalar_one()
    result = await db.execute(
        select(Workflow)
        .where(*filters)
        .order_by(Workflow.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = [WorkflowOut.model_validate(w) for w in result.scalars().all()]
    pages = (total + page_size - 1) // page_size if total else 0
    return WorkflowListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(
    workflow_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkflowOut:
    wf = await _get_owned_workflow(workflow_id, user, db)
    return WorkflowOut.model_validate(wf)


@router.put("/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    workflow_id: str,
    payload: WorkflowUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkflowOut:
    wf = await _get_owned_workflow(workflow_id, user, db)
    _validate_definition(payload.definition_json)
    if payload.name is not None:
        wf.name = payload.name
    if payload.description is not None:
        wf.description = payload.description
    wf.definition_json = payload.definition_json
    wf.version += 1
    await db.commit()
    await db.refresh(wf)
    return WorkflowOut.model_validate(wf)


@router.post("/{workflow_id}/publish", response_model=WorkflowOut)
async def publish_workflow(
    workflow_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkflowOut:
    wf = await _get_owned_workflow(workflow_id, user, db)
    _validate_definition(wf.definition_json or {})
    wf.status = "published"
    wf.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(wf)
    return WorkflowOut.model_validate(wf)


@router.delete("/{workflow_id}", response_model=MessageResponse)
async def archive_workflow(
    workflow_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    wf = await _get_owned_workflow(workflow_id, user, db)
    wf.status = "archived"
    await db.commit()
    return MessageResponse(message="Workflow archived.")

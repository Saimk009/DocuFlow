"""Case management routes (/api/v1/cases). Tenant-scoped."""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.case import Case, CaseDocument, CaseNote, CaseTask
from app.models.document import Document
from app.models.user import User

router = APIRouter(prefix="/api/v1/cases", tags=["cases"])


class CaseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    type: str = Field(..., min_length=1, max_length=64)
    priority: str = "normal"
    owner_id: str | None = None
    due_date: date | None = None
    description: str | None = None


class CaseUpdate(BaseModel):
    title: str | None = None
    type: str | None = None
    status: str | None = None
    priority: str | None = None
    owner_id: str | None = None
    due_date: date | None = None
    description: str | None = None


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    assignee_id: str | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    assignee_id: str | None = None
    due_date: date | None = None
    is_done: bool | None = None


class NoteCreate(BaseModel):
    content: str = Field(..., min_length=1)


class LinkDocument(BaseModel):
    document_id: str


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    type: str
    status: str
    priority: str
    owner_id: str | None = None
    due_date: date | None = None
    description: str | None = None
    created_at: datetime


class CaseListResponse(BaseModel):
    items: list[CaseOut]
    total: int
    page: int
    pages: int


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    assignee_id: str | None = None
    due_date: date | None = None
    is_done: bool
    created_at: datetime


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    author_id: str | None = None
    content: str
    created_at: datetime


class DocumentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    status: str
    doc_type: str | None = None


class TimelineEntry(BaseModel):
    kind: str
    label: str
    at: datetime


class CaseDetail(CaseOut):
    tasks: list[TaskOut] = Field(default_factory=list)
    notes: list[NoteOut] = Field(default_factory=list)
    documents: list[DocumentBrief] = Field(default_factory=list)
    timeline: list[TimelineEntry] = Field(default_factory=list)


class MessageResponse(BaseModel):
    message: str


async def _get_owned_case(case_id: str, user: User, db: AsyncSession) -> Case:
    case = await db.get(Case, case_id)
    if case is None or str(case.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    return case


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: CaseCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaseOut:
    case = Case(
        tenant_id=user.tenant_id,
        title=payload.title,
        type=payload.type,
        status="open",
        priority=payload.priority,
        owner_id=payload.owner_id or user.id,
        due_date=payload.due_date,
        description=payload.description,
    )
    db.add(case)
    await db.commit()
    await db.refresh(case)
    return CaseOut.model_validate(case)


@router.get("", response_model=CaseListResponse)
async def list_cases(
    status_filter: str | None = Query(None, alias="status"),
    type_filter: str | None = Query(None, alias="type"),
    priority: str | None = Query(None),
    owner_id: str | None = Query(None),
    due_date_before: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaseListResponse:
    filters = [Case.tenant_id == user.tenant_id]
    if status_filter:
        filters.append(Case.status == status_filter)
    if type_filter:
        filters.append(Case.type == type_filter)
    if priority:
        filters.append(Case.priority == priority)
    if owner_id:
        filters.append(Case.owner_id == owner_id)
    if due_date_before:
        filters.append(Case.due_date <= due_date_before)

    total = (
        await db.execute(select(func.count()).select_from(Case).where(*filters))
    ).scalar_one()
    cases = (
        await db.execute(
            select(Case)
            .where(*filters)
            .order_by(Case.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars().all()
    items = [CaseOut.model_validate(c) for c in cases]
    pages = (total + page_size - 1) // page_size if total else 0
    return CaseListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/{case_id}", response_model=CaseDetail)
async def get_case(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaseDetail:
    case = await _get_owned_case(case_id, user, db)

    doc_ids = [cd.document_id for cd in case.documents]
    docs: list[Document] = []
    if doc_ids:
        docs = list(
            (
                await db.execute(select(Document).where(Document.id.in_(doc_ids)))
            ).scalars().all()
        )

    timeline = [TimelineEntry(kind="case_created", label="Case created", at=case.created_at)]
    for t in case.tasks:
        timeline.append(TimelineEntry(kind="task_added", label=f"Task: {t.title}", at=t.created_at))
    for n in case.notes:
        timeline.append(TimelineEntry(kind="note_added", label="Note added", at=n.created_at))
    timeline.sort(key=lambda e: e.at)

    detail = CaseDetail.model_validate(case)
    detail.tasks = [TaskOut.model_validate(t) for t in case.tasks]
    detail.notes = [NoteOut.model_validate(n) for n in case.notes]
    detail.documents = [DocumentBrief.model_validate(d) for d in docs]
    detail.timeline = timeline
    return detail


@router.put("/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: str,
    payload: CaseUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CaseOut:
    case = await _get_owned_case(case_id, user, db)
    changed = payload.model_dump(exclude_unset=True)
    for key, value in changed.items():
        setattr(case, key, value)
    await db.commit()
    await db.refresh(case)

    from app.services.webhook_service import webhook_service

    try:
        await webhook_service.trigger(
            str(user.tenant_id),
            "case.updated",
            {
                "case_id": str(case.id),
                "title": case.title,
                "status": case.status,
                "priority": case.priority,
                "changed_fields": list(changed.keys()),
            },
        )
    except Exception:
        pass

    return CaseOut.model_validate(case)


@router.post("/{case_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def add_task(
    case_id: str,
    payload: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    await _get_owned_case(case_id, user, db)
    task = CaseTask(
        case_id=case_id,
        title=payload.title,
        assignee_id=payload.assignee_id,
        due_date=payload.due_date,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)


@router.patch("/{case_id}/tasks/{task_id}", response_model=TaskOut)
async def update_task(
    case_id: str,
    task_id: str,
    payload: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    await _get_owned_case(case_id, user, db)
    task = await db.get(CaseTask, task_id)
    if task is None or str(task.case_id) != str(case_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    await db.commit()
    await db.refresh(task)
    return TaskOut.model_validate(task)


@router.post("/{case_id}/notes", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def add_note(
    case_id: str,
    payload: NoteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NoteOut:
    await _get_owned_case(case_id, user, db)
    note = CaseNote(case_id=case_id, author_id=user.id, content=payload.content)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return NoteOut.model_validate(note)


@router.post("/{case_id}/documents", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def link_document(
    case_id: str,
    payload: LinkDocument,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await _get_owned_case(case_id, user, db)
    document = await db.get(Document, payload.document_id)
    if document is None or str(document.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    existing = (
        await db.execute(
            select(CaseDocument).where(
                CaseDocument.case_id == case_id,
                CaseDocument.document_id == payload.document_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Document already linked to this case."
        )

    db.add(CaseDocument(case_id=case_id, document_id=payload.document_id))
    await db.commit()
    return MessageResponse(message="Document linked.")


@router.delete("/{case_id}/documents/{doc_id}", response_model=MessageResponse)
async def unlink_document(
    case_id: str,
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await _get_owned_case(case_id, user, db)
    link = (
        await db.execute(
            select(CaseDocument).where(
                CaseDocument.case_id == case_id, CaseDocument.document_id == doc_id
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found.")
    await db.delete(link)
    await db.commit()
    return MessageResponse(message="Document unlinked.")

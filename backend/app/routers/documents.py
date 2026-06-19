"""Document processing routes (/api/v1/documents). All endpoints tenant-scoped."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.batch import Batch
from app.models.document import Document, DocumentEvent, DocumentField
from app.models.user import User
from app.models.workflow import Workflow
from app.services.export_service import export_service
from app.schemas.document import (
    DocumentDetail,
    DocumentEventOut,
    DocumentFieldOut,
    DocumentListResponse,
    DocumentSummary,
    FieldUpdate,
    MessageResponse,
    StatusUpdate,
    UploadedDocument,
)
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

_ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "tif"}
_MAX_FILE_BYTES = 50 * 1024 * 1024  # 50MB


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _build_document_filters(
    user: User,
    *,
    status_filter: str | None,
    doc_type: str | None,
    batch_id: str | None,
    workflow_id: str | None,
    search: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list:
    filters = [Document.tenant_id == user.tenant_id, Document.is_active.is_(True)]
    if status_filter:
        filters.append(Document.status == status_filter)
    if doc_type:
        filters.append(Document.doc_type == doc_type)
    if batch_id:
        filters.append(Document.batch_id == batch_id)
    if workflow_id:
        filters.append(Document.workflow_id == workflow_id)
    if search:
        filters.append(
            or_(
                Document.filename.ilike(f"%{search}%"),
                Document.ocr_text.ilike(f"%{search}%"),
            )
        )
    if date_from:
        filters.append(Document.created_at >= date_from)
    if date_to:
        filters.append(Document.created_at <= date_to)
    return filters


async def _get_owned_document(
    doc_id: str, user: User, db: AsyncSession, *, active_only: bool = True
) -> Document:
    document = await db.get(Document, doc_id)
    if (
        document is None
        or str(document.tenant_id) != str(user.tenant_id)
        or (active_only and not document.is_active)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )
    return document


@router.post("/upload", response_model=list[UploadedDocument], status_code=status.HTTP_201_CREATED)
async def upload_documents(
    files: list[UploadFile] = File(...),
    batch_id: str | None = Form(None),
    workflow_id: str | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UploadedDocument]:
    from app.workers.document_tasks import process_document

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided."
        )

    created: list[UploadedDocument] = []
    for upload in files:
        ext = _ext(upload.filename or "")
        if ext not in _ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}.",
            )
        data = await upload.read()
        if len(data) > _MAX_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File '{upload.filename}' exceeds the 50MB limit.",
            )
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{upload.filename}' is empty.",
            )

        storage_path = await storage_service.upload_file(
            tenant_id=str(user.tenant_id),
            file_bytes=data,
            filename=upload.filename or f"upload.{ext}",
            content_type=upload.content_type or "application/octet-stream",
        )

        document = Document(
            tenant_id=user.tenant_id,
            batch_id=batch_id,
            workflow_id=workflow_id,
            filename=upload.filename or f"upload.{ext}",
            storage_path=storage_path,
            file_type=ext,
            status="captured",
        )
        db.add(document)
        await db.flush()
        db.add(
            DocumentEvent(
                document_id=document.id,
                event_type="uploaded",
                actor_id=user.id,
                event_metadata={"filename": document.filename},
            )
        )
        await db.commit()
        await db.refresh(document)

        process_document.delay(str(document.id))
        created.append(
            UploadedDocument(
                id=str(document.id), filename=document.filename, status=document.status
            )
        )

    return created


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    status_filter: str | None = Query(None, alias="status"),
    doc_type: str | None = Query(None),
    batch_id: str | None = Query(None),
    workflow_id: str | None = Query(None),
    search: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    sort: str = Query("newest"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    filters = [Document.tenant_id == user.tenant_id, Document.is_active.is_(True)]
    if status_filter:
        filters.append(Document.status == status_filter)
    if doc_type:
        filters.append(Document.doc_type == doc_type)
    if batch_id:
        filters.append(Document.batch_id == batch_id)
    if workflow_id:
        filters.append(Document.workflow_id == workflow_id)
    if search:
        filters.append(
            or_(
                Document.filename.ilike(f"%{search}%"),
                Document.ocr_text.ilike(f"%{search}%"),
            )
        )
    if date_from:
        filters.append(Document.created_at >= date_from)
    if date_to:
        filters.append(Document.created_at <= date_to)

    total = (
        await db.execute(select(func.count()).select_from(Document).where(*filters))
    ).scalar_one()

    order_by = (
        Document.created_at.asc() if sort == "oldest" else Document.created_at.desc()
    )
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Document)
        .where(*filters)
        .order_by(order_by)
        .limit(page_size)
        .offset(offset)
    )
    documents = result.scalars().all()

    def _avg_confidence(doc: Document) -> float | None:
        if not doc.fields:
            return None
        return round(sum(f.confidence for f in doc.fields) / len(doc.fields), 4)

    items = [
        DocumentSummary(
            id=str(d.id),
            filename=d.filename,
            file_type=d.file_type,
            page_count=d.page_count,
            status=d.status,
            doc_type=d.doc_type,
            batch_id=str(d.batch_id) if d.batch_id else None,
            workflow_id=str(d.workflow_id) if d.workflow_id else None,
            assigned_to=str(d.assigned_to) if d.assigned_to else None,
            field_count=len(d.fields),
            event_count=len(d.events),
            avg_confidence=_avg_confidence(d),
            created_at=d.created_at,
            completed_at=d.completed_at,
        )
        for d in documents
    ]
    pages = (total + page_size - 1) // page_size if total else 0
    return DocumentListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/export")
async def export_documents(
    format: str = Query("csv", pattern="^(csv|json)$"),
    status_filter: str | None = Query(None, alias="status"),
    doc_type: str | None = Query(None),
    batch_id: str | None = Query(None),
    workflow_id: str | None = Query(None),
    search: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export the filtered document set as CSV or JSON (same filters as list)."""
    filters = _build_document_filters(
        user,
        status_filter=status_filter,
        doc_type=doc_type,
        batch_id=batch_id,
        workflow_id=workflow_id,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )
    documents = (
        await db.execute(
            select(Document).where(*filters).order_by(Document.created_at.desc())
        )
    ).scalars().all()

    batch_ids = {str(d.batch_id) for d in documents if d.batch_id}
    workflow_ids = {str(d.workflow_id) for d in documents if d.workflow_id}

    batch_names: dict[str, str] = {}
    if batch_ids:
        rows = await db.execute(select(Batch.id, Batch.name).where(Batch.id.in_(batch_ids)))
        batch_names = {str(i): n for i, n in rows.all()}
    workflow_names: dict[str, str] = {}
    if workflow_ids:
        rows = await db.execute(
            select(Workflow.id, Workflow.name).where(Workflow.id.in_(workflow_ids))
        )
        workflow_names = {str(i): n for i, n in rows.all()}

    date_str = datetime.now(timezone.utc).date().isoformat()
    if format == "json":
        content = export_service.export_to_json(documents, batch_names, workflow_names)
        media_type = "application/json"
        ext = "json"
    else:
        content = export_service.export_to_csv(documents, batch_names, workflow_names)
        media_type = "text/csv"
        ext = "csv"

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="docuflow-export-{date_str}.{ext}"'
        },
    )


@router.get("/{doc_id}", response_model=DocumentDetail)
async def get_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentDetail:
    document = await _get_owned_document(doc_id, user, db)

    file_url: str | None = None
    try:
        file_url = await storage_service.get_file_url(document.storage_path)
    except Exception:
        file_url = None

    return DocumentDetail(
        id=str(document.id),
        filename=document.filename,
        file_type=document.file_type,
        page_count=document.page_count,
        status=document.status,
        doc_type=document.doc_type,
        batch_id=str(document.batch_id) if document.batch_id else None,
        workflow_id=str(document.workflow_id) if document.workflow_id else None,
        assigned_to=str(document.assigned_to) if document.assigned_to else None,
        ocr_text=document.ocr_text,
        file_url=file_url,
        fields=[DocumentFieldOut.model_validate(f) for f in document.fields],
        events=[
            DocumentEventOut.model_validate(e)
            for e in sorted(document.events, key=lambda e: e.created_at)
        ],
        created_at=document.created_at,
        completed_at=document.completed_at,
    )


@router.patch("/{doc_id}/fields", response_model=MessageResponse)
async def update_fields(
    doc_id: str,
    updates: list[FieldUpdate],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    document = await _get_owned_document(doc_id, user, db)

    fields_by_id = {str(f.id): f for f in document.fields}
    now = datetime.now(timezone.utc)
    updated = 0
    for upd in updates:
        field = fields_by_id.get(str(upd.field_id))
        if field is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Field '{upd.field_id}' does not belong to this document.",
            )
        field.validated_value = upd.validated_value
        field.is_validated = True
        field.validator_id = user.id
        field.validated_at = now
        updated += 1

    db.add(
        DocumentEvent(
            document_id=document.id,
            event_type="fields_validated",
            actor_id=user.id,
            event_metadata={"updated_count": updated},
        )
    )
    await db.commit()
    return MessageResponse(message=f"Updated {updated} field(s).")


@router.patch("/{doc_id}/status", response_model=MessageResponse)
async def update_status(
    doc_id: str,
    payload: StatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    document = await _get_owned_document(doc_id, user, db)
    action = payload.action

    if action == "approve":
        document.status = "complete"
        document.completed_at = datetime.now(timezone.utc)
        event_type = "approved"
        meta: dict = {}
    elif action == "reject":
        document.status = "rejected"
        event_type = "rejected"
        meta = {"reason": payload.reason}
    elif action == "flag":
        document.status = "exception"
        event_type = "flagged"
        meta = {"reason": payload.reason}
    elif action == "reassign":
        if not payload.assigned_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="assigned_to is required for reassign.",
            )
        document.assigned_to = payload.assigned_to
        event_type = "reassigned"
        meta = {"assigned_to": payload.assigned_to}
    else:  # pragma: no cover - guarded by schema Literal
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown action."
        )

    db.add(
        DocumentEvent(
            document_id=document.id,
            event_type=event_type,
            actor_id=user.id,
            event_metadata=meta,
        )
    )
    await db.commit()
    return MessageResponse(message=f"Document {action} applied.")


@router.delete("/{doc_id}", response_model=MessageResponse)
async def delete_document(
    doc_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    document = await _get_owned_document(doc_id, user, db)

    document.is_active = False
    db.add(
        DocumentEvent(
            document_id=document.id,
            event_type="deleted",
            actor_id=user.id,
            event_metadata={},
        )
    )
    await db.commit()

    try:
        await storage_service.delete_file(document.storage_path)
    except Exception:
        pass

    return MessageResponse(message="Document deleted.")

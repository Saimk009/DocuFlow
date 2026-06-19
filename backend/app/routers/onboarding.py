"""Onboarding setup wizard (/api/v1/onboarding).

Gets a freshly-registered tenant from signup to a live, working pipeline in
minutes: pick an industry template, and we clone a ready-to-publish workflow,
create a starter batch, and (optionally) preload a sample document so the very
first processing result appears within seconds.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.batch import Batch
from app.models.connector import Connector
from app.models.document import Document, DocumentEvent
from app.models.invitation import Invitation
from app.models.template import IndustryTemplate
from app.models.tenant import Tenant
from app.models.user import User
from app.models.workflow import Workflow
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str
    name: str
    description: str
    icon: str
    doc_types: list[Any]
    default_fields: dict[str, Any]
    default_workflow_json: dict[str, Any]
    sample_document_url: str | None = None
    is_active: bool


class SetupRequest(BaseModel):
    template_key: str = Field(..., min_length=1, max_length=64)
    connector_preferences: list[str] | None = None
    sample_doc_uploaded: bool | None = None


class SetupResult(BaseModel):
    workflow_id: str
    batch_id: str
    sample_document_id: str | None = None


class SetupChecklist(BaseModel):
    workflow_published: bool
    first_document_processed: bool
    team_invited: bool
    ai_provider_configured: bool
    connector_added: bool


class SetupStatus(BaseModel):
    onboarding_completed: bool
    onboarding_template_key: str | None = None
    checklist: SetupChecklist


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _load_tenant(user: User, db: AsyncSession) -> Tenant:
    tenant = await db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found."
        )
    return tenant


def _sample_ext(url: str) -> str:
    ext = url.rsplit(".", 1)[-1].lower() if "." in url.rsplit("/", 1)[-1] else "pdf"
    return ext if ext in {"pdf", "png", "jpg", "jpeg", "tiff", "tif"} else "pdf"


async def _preload_sample(
    template: IndustryTemplate, tenant_id: str, workflow_id: str, batch_id: str, db: AsyncSession
) -> str | None:
    """Best-effort: copy the template's sample document into tenant storage and
    enqueue it for processing. Never fails the setup if storage/fetch is down."""
    url = template.sample_document_url
    if not url:
        return None
    try:
        import httpx

        from app.workers.document_tasks import process_document

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.content

        ext = _sample_ext(url)
        filename = f"sample-{template.key}.{ext}"
        content_type = "application/pdf" if ext == "pdf" else f"image/{ext}"
        storage_path = await storage_service.upload_file(
            tenant_id=str(tenant_id),
            file_bytes=data,
            filename=filename,
            content_type=content_type,
        )

        document = Document(
            tenant_id=tenant_id,
            batch_id=batch_id,
            workflow_id=workflow_id,
            filename=filename,
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
                event_metadata={"filename": filename, "source": "onboarding_sample"},
            )
        )
        await db.commit()
        await db.refresh(document)

        process_document.delay(str(document.id))
        return str(document.id)
    except Exception:
        # Sample preloading is a nice-to-have; setup still succeeds without it.
        await db.rollback()
        return None


# ── Routes ───────────────────────────────────────────────────────────────────
@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db)) -> list[TemplateOut]:
    """Public: the industry templates shown during signup (no auth required)."""
    rows = (
        await db.execute(
            select(IndustryTemplate)
            .where(IndustryTemplate.is_active.is_(True))
            .order_by(IndustryTemplate.name)
        )
    ).scalars().all()
    return [TemplateOut.model_validate(t) for t in rows]


@router.post("/setup", response_model=SetupResult)
async def run_setup(
    payload: SetupRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SetupResult:
    template = (
        await db.execute(
            select(IndustryTemplate).where(
                IndustryTemplate.key == payload.template_key,
                IndustryTemplate.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown template '{payload.template_key}'.",
        )

    now = datetime.now(timezone.utc)

    # 1. Clone the template's workflow — published immediately (skip draft).
    workflow = Workflow(
        tenant_id=user.tenant_id,
        name=template.default_workflow_json.get("name") or f"{template.name} Pipeline",
        description=template.description,
        definition_json=template.default_workflow_json or {"nodes": [], "edges": []},
        status="published",
        version=1,
        created_by=user.id,
        published_at=now,
    )
    db.add(workflow)
    await db.flush()  # populate workflow.id

    # 2. Create the starter batch pointing at that workflow.
    batch = Batch(
        tenant_id=user.tenant_id,
        name="Getting Started",
        workflow_id=workflow.id,
        priority="normal",
        status="pending",
        submitted_by=user.id,
    )
    db.add(batch)
    await db.flush()

    # 3. Mark the tenant onboarded.
    tenant = await _load_tenant(user, db)
    tenant.onboarding_completed = True
    tenant.onboarding_template_key = template.key
    if tenant.onboarding_started_at is None:
        tenant.onboarding_started_at = now

    workflow_id = str(workflow.id)
    batch_id = str(batch.id)
    await db.commit()

    # 4. Optionally preload a sample document so they see a live result fast.
    sample_document_id = await _preload_sample(
        template, str(user.tenant_id), workflow_id, batch_id, db
    )

    return SetupResult(
        workflow_id=workflow_id,
        batch_id=batch_id,
        sample_document_id=sample_document_id,
    )


@router.get("/setup-status", response_model=SetupStatus)
async def setup_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SetupStatus:
    tenant = await _load_tenant(user, db)
    tid = user.tenant_id

    async def _exists(stmt) -> bool:
        return (await db.execute(stmt)).first() is not None

    workflow_published = await _exists(
        select(Workflow.id).where(
            Workflow.tenant_id == tid, Workflow.status == "published"
        )
    )
    first_document_processed = await _exists(
        select(Document.id).where(
            Document.tenant_id == tid, Document.status == "complete"
        )
    )
    invitation_exists = await _exists(
        select(Invitation.id).where(Invitation.tenant_id == tid)
    )
    user_count = (
        await db.execute(
            select(func.count()).select_from(User).where(User.tenant_id == tid)
        )
    ).scalar_one()
    connector_added = await _exists(
        select(Connector.id).where(Connector.tenant_id == tid)
    )

    checklist = SetupChecklist(
        workflow_published=workflow_published,
        first_document_processed=first_document_processed,
        team_invited=invitation_exists or user_count > 1,
        ai_provider_configured=tenant.ai_api_key_enc is not None,
        connector_added=connector_added,
    )
    return SetupStatus(
        onboarding_completed=tenant.onboarding_completed,
        onboarding_template_key=tenant.onboarding_template_key,
        checklist=checklist,
    )

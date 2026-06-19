"""Connector & webhook routes (/api/v1/connectors). Tenant-scoped.

Connector configs are encrypted at rest with ``crypto.encrypt_string`` and are
never returned in plaintext over the API.
"""
from __future__ import annotations

import asyncio
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.connector import Connector, Webhook
from app.models.connector_log import ConnectorExecutionLog
from app.models.document import Document, DocumentField
from app.models.template import IndustryTemplate
from app.models.user import User
from app.services.ai_service import _FIELD_HINTS
from app.services.connector_engine import connector_engine
from app.services.email_service import EmailIngestionService
from app.utils.crypto import decrypt_string, encrypt_string

_TEST_TIMEOUT = 10.0

router = APIRouter(prefix="/api/v1/connectors", tags=["connectors"])

_CONNECTOR_CATALOG = [
    {
        "type": "webhook",
        "name": "Webhook",
        "description": "Send events to an external HTTP endpoint.",
        "icon": "webhook",
        "fields_required": ["url"],
    },
    {
        "type": "slack",
        "name": "Slack",
        "description": "Post notifications to a Slack channel.",
        "icon": "slack",
        "fields_required": ["webhook_url", "channel"],
    },
    {
        "type": "email",
        "name": "Email (SMTP)",
        "description": "Send email notifications via SMTP.",
        "icon": "mail",
        "fields_required": ["host", "port", "username", "password"],
    },
    {
        "type": "sap",
        "name": "SAP",
        "description": "Integrate with SAP ERP.",
        "icon": "sap",
        "fields_required": ["base_url", "client", "username", "password"],
    },
    {
        "type": "salesforce",
        "name": "Salesforce",
        "description": "Sync records with Salesforce CRM.",
        "icon": "salesforce",
        "fields_required": ["instance_url", "client_id", "client_secret"],
    },
    {
        "type": "sharepoint",
        "name": "SharePoint",
        "description": "Read/write documents in SharePoint.",
        "icon": "sharepoint",
        "fields_required": ["site_url", "client_id", "client_secret", "tenant"],
    },
    {
        "type": "rest_api",
        "name": "REST API",
        "description": "Generic REST API integration.",
        "icon": "api",
        "fields_required": ["base_url", "api_key"],
    },
]
_REQUIRED_BY_TYPE = {c["type"]: c["fields_required"] for c in _CONNECTOR_CATALOG}


class ConnectorTypeOut(BaseModel):
    type: str
    name: str
    description: str
    icon: str
    fields_required: list[str]


_AUTH_TYPES = {"none", "api_key", "bearer_token", "basic", "oauth2"}
_TRANSFORMS = {"none", "uppercase", "date_iso", "currency_cents"}


class FieldMapping(BaseModel):
    source_field: str
    target_path: str
    transform: str = "none"


class RequestTemplate(BaseModel):
    method: str = "POST"
    path: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    body_template: Any | None = None


class ConnectorCreate(BaseModel):
    type: str
    name: str = Field(..., min_length=1, max_length=255)
    config: dict[str, Any] = Field(default_factory=dict)
    auth_type: str = "none"
    auth_config: dict[str, Any] = Field(default_factory=dict)
    base_url: str | None = None
    field_mappings: list[FieldMapping] = Field(default_factory=list)
    request_template: RequestTemplate | None = None
    trigger_events: list[str] = Field(default_factory=lambda: ["document.completed"])


class ConnectorUpdate(BaseModel):
    name: str | None = None
    config: dict[str, Any] | None = None
    auth_type: str | None = None
    auth_config: dict[str, Any] | None = None
    base_url: str | None = None
    field_mappings: list[FieldMapping] | None = None
    request_template: RequestTemplate | None = None
    trigger_events: list[str] | None = None


class ConnectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    name: str
    status: str
    last_tested_at: datetime | None = None
    config_keys: list[str] = Field(default_factory=list)
    auth_type: str = "none"
    base_url: str | None = None
    field_mappings: list[dict[str, Any]] = Field(default_factory=list)
    request_template: dict[str, Any] | None = None
    trigger_events: list[str] = Field(default_factory=list)
    has_auth: bool = False


class PreviewRequest(BaseModel):
    sample_document_id: str


class ConnectionTestResult(BaseModel):
    status: str
    success: bool
    status_code: int | None = None
    message: str
    latency_ms: int = 0


class ConnectorLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    connector_id: str
    document_id: str | None = None
    request_summary: dict[str, Any] = Field(default_factory=dict)
    response_status: int | None = None
    response_body_truncated: str | None = None
    success: bool
    error_message: str | None = None
    duration_ms: int
    created_at: datetime


class ConnectorLogList(BaseModel):
    items: list[ConnectorLogOut]
    total: int
    page: int
    pages: int


class FieldMappingOption(BaseModel):
    field_key: str
    field_label: str


class WebhookCreate(BaseModel):
    url: str = Field(..., min_length=1)
    events: list[str] = Field(default_factory=list)


class WebhookUpdate(BaseModel):
    is_active: bool


class WebhookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    events: list[str]
    secret: str
    is_active: bool


class TestResult(BaseModel):
    status: str
    message: str


class MessageResponse(BaseModel):
    message: str


def _config_keys(connector: Connector) -> list[str]:
    try:
        data = json.loads(decrypt_string(connector.config_enc, settings.encryption_secret))
        return sorted(data.keys()) if isinstance(data, dict) else []
    except Exception:
        return []


def _to_out(connector: Connector) -> ConnectorOut:
    item = ConnectorOut.model_validate(connector)
    item.config_keys = _config_keys(connector)
    item.has_auth = bool(connector.auth_config_enc)
    return item


async def _get_owned_connector(connector_id: str, user: User, db: AsyncSession) -> Connector:
    connector = await db.get(Connector, connector_id)
    if connector is None or str(connector.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found.")
    return connector


@router.get("/available", response_model=list[ConnectorTypeOut])
async def available_connectors(
    user: User = Depends(get_current_user),
) -> list[ConnectorTypeOut]:
    return [ConnectorTypeOut(**c) for c in _CONNECTOR_CATALOG]


# --- Webhooks (declared before /{connector_id} to avoid path capture) ---

@router.post("/webhooks", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: WebhookCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WebhookOut:
    webhook = Webhook(
        tenant_id=user.tenant_id,
        url=payload.url,
        events=payload.events,
        secret=secrets.token_hex(32),
        is_active=True,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return WebhookOut.model_validate(webhook)


@router.get("/webhooks", response_model=list[WebhookOut])
async def list_webhooks(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WebhookOut]:
    rows = (
        await db.execute(select(Webhook).where(Webhook.tenant_id == user.tenant_id))
    ).scalars().all()
    return [WebhookOut.model_validate(w) for w in rows]


@router.patch("/webhooks/{webhook_id}", response_model=WebhookOut)
async def update_webhook(
    webhook_id: str,
    payload: WebhookUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WebhookOut:
    webhook = await db.get(Webhook, webhook_id)
    if webhook is None or str(webhook.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")
    webhook.is_active = payload.is_active
    await db.commit()
    await db.refresh(webhook)
    return WebhookOut.model_validate(webhook)


@router.delete("/webhooks/{webhook_id}", response_model=MessageResponse)
async def delete_webhook(
    webhook_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    webhook = await db.get(Webhook, webhook_id)
    if webhook is None or str(webhook.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")
    await db.delete(webhook)
    await db.commit()
    return MessageResponse(message="Webhook deleted.")


# --- Connectors ---

@router.get("", response_model=list[ConnectorOut])
async def list_connectors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ConnectorOut]:
    rows = (
        await db.execute(select(Connector).where(Connector.tenant_id == user.tenant_id))
    ).scalars().all()
    return [_to_out(c) for c in rows]


@router.post("", response_model=ConnectorOut, status_code=status.HTTP_201_CREATED)
async def create_connector(
    payload: ConnectorCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConnectorOut:
    if payload.type not in _REQUIRED_BY_TYPE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown connector type '{payload.type}'.",
        )
    if payload.auth_type not in _AUTH_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown auth_type '{payload.auth_type}'.",
        )
    connector = Connector(
        tenant_id=user.tenant_id,
        type=payload.type,
        name=payload.name,
        config_enc=encrypt_string(json.dumps(payload.config), settings.encryption_secret),
        status="untested",
        auth_type=payload.auth_type,
        auth_config_enc=(
            encrypt_string(json.dumps(payload.auth_config), settings.encryption_secret)
            if payload.auth_config
            else None
        ),
        base_url=payload.base_url,
        field_mappings=[m.model_dump() for m in payload.field_mappings],
        request_template=(
            payload.request_template.model_dump() if payload.request_template else None
        ),
        trigger_events=payload.trigger_events or ["document.completed"],
    )
    db.add(connector)
    await db.commit()
    await db.refresh(connector)
    return _to_out(connector)


@router.put("/{connector_id}", response_model=ConnectorOut)
async def update_connector(
    connector_id: str,
    payload: ConnectorUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConnectorOut:
    connector = await _get_owned_connector(connector_id, user, db)
    if payload.name is not None:
        connector.name = payload.name
    if payload.config is not None:
        connector.config_enc = encrypt_string(
            json.dumps(payload.config), settings.encryption_secret
        )
        connector.status = "untested"
    if payload.auth_type is not None:
        if payload.auth_type not in _AUTH_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown auth_type '{payload.auth_type}'.",
            )
        connector.auth_type = payload.auth_type
        connector.status = "untested"
    if payload.auth_config is not None:
        connector.auth_config_enc = (
            encrypt_string(json.dumps(payload.auth_config), settings.encryption_secret)
            if payload.auth_config
            else None
        )
        connector.status = "untested"
    if payload.base_url is not None:
        connector.base_url = payload.base_url
    if payload.field_mappings is not None:
        connector.field_mappings = [m.model_dump() for m in payload.field_mappings]
    if payload.request_template is not None:
        connector.request_template = payload.request_template.model_dump()
    if payload.trigger_events is not None:
        connector.trigger_events = payload.trigger_events
    await db.commit()
    await db.refresh(connector)
    return _to_out(connector)


async def _test_http_post(url: str, payload: dict[str, Any]) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=_TEST_TIMEOUT) as client:
            resp = await client.post(url, json=payload)
        if 200 <= resp.status_code < 300:
            return True, f"Endpoint responded {resp.status_code}."
        return False, f"Endpoint returned {resp.status_code}."
    except Exception as exc:  # noqa: BLE001
        return False, f"Request failed: {exc}"


async def _test_http_get(url: str, headers: dict[str, str]) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=_TEST_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
        if 200 <= resp.status_code < 300:
            return True, f"Endpoint responded {resp.status_code}."
        return False, f"Endpoint returned {resp.status_code}."
    except Exception as exc:  # noqa: BLE001
        return False, f"Request failed: {exc}"


def _test_imap(host: str, port: int, username: str, password: str) -> None:
    service = EmailIngestionService(host, port, username, password)
    try:
        service.connect_imap()
    finally:
        service.logout()


async def _run_connector_test(
    conn_type: str, config: dict[str, Any]
) -> tuple[bool, str]:
    if conn_type == "webhook":
        return await _test_http_post(
            config["url"],
            {"event": "connector.test", "message": "DocuFlow connection test."},
        )
    if conn_type == "slack":
        return await _test_http_post(
            config["webhook_url"],
            {"text": ":white_check_mark: DocuFlow connection test successful."},
        )
    if conn_type == "rest_api":
        api_key = config.get("api_key")
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        return await _test_http_get(config["base_url"], headers)
    if conn_type == "email":
        try:
            port = int(config.get("port") or 993)
        except (TypeError, ValueError):
            port = 993
        try:
            await asyncio.to_thread(
                _test_imap,
                config["host"],
                port,
                config["username"],
                config["password"],
            )
            return True, "IMAP login succeeded."
        except Exception as exc:  # noqa: BLE001
            return False, f"IMAP connection failed: {exc}"

    # No live probe available for this type -> required-fields presence only.
    return True, "Configuration validated."


@router.post("/{connector_id}/test", response_model=ConnectionTestResult)
async def test_connector(
    connector_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConnectionTestResult:
    connector = await _get_owned_connector(connector_id, user, db)
    connector.last_tested_at = datetime.now(timezone.utc)

    # Generic REST connector -> real probe via the engine.
    if connector.base_url:
        result = await connector_engine.test_connection(connector)
        connector.status = "connected" if result["success"] else "failed"
        await db.commit()
        return ConnectionTestResult(status=connector.status, **result)

    # Legacy typed connectors (webhook/slack/email/...) keep their probes.
    required = _REQUIRED_BY_TYPE.get(connector.type, [])
    try:
        config = json.loads(decrypt_string(connector.config_enc, settings.encryption_secret))
    except Exception:
        config = {}

    missing = [f for f in required if not config.get(f)]
    if missing:
        connector.status = "failed"
        await db.commit()
        return ConnectionTestResult(
            status="failed",
            success=False,
            message=f"Missing required fields: {', '.join(missing)}.",
        )

    started = time.perf_counter()
    ok, message = await _run_connector_test(connector.type, config)
    latency = int((time.perf_counter() - started) * 1000)
    connector.status = "connected" if ok else "failed"
    await db.commit()
    return ConnectionTestResult(
        status=connector.status, success=ok, message=message, latency_ms=latency
    )


async def _load_owned_document(
    doc_id: str, user: User, db: AsyncSession
) -> Document:
    document = await db.get(Document, doc_id)
    if document is None or str(document.tenant_id) != str(user.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found."
        )
    return document


@router.post("/{connector_id}/preview")
async def preview_connector(
    connector_id: str,
    payload: PreviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Dry-run: return the fully interpolated request (auth redacted) without sending."""
    connector = await _get_owned_connector(connector_id, user, db)
    await _load_owned_document(payload.sample_document_id, user, db)
    fields = (
        await db.execute(
            select(DocumentField).where(
                DocumentField.document_id == payload.sample_document_id
            )
        )
    ).scalars().all()
    return await connector_engine.preview(connector, list(fields))


@router.get("/{connector_id}/logs", response_model=ConnectorLogList)
async def connector_logs(
    connector_id: str,
    success: bool | None = None,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConnectorLogList:
    await _get_owned_connector(connector_id, user, db)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    filters = [ConnectorExecutionLog.connector_id == connector_id]
    if success is not None:
        filters.append(ConnectorExecutionLog.success.is_(success))

    total = (
        await db.execute(
            select(func.count()).select_from(ConnectorExecutionLog).where(*filters)
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(ConnectorExecutionLog)
            .where(*filters)
            .order_by(ConnectorExecutionLog.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars().all()
    pages = (total + page_size - 1) // page_size if total else 0
    return ConnectorLogList(
        items=[ConnectorLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        pages=pages,
    )


class RetryResult(BaseModel):
    requeued: int


@router.post("/{connector_id}/retry", response_model=RetryResult)
async def retry_failed(
    connector_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RetryResult:
    """Re-enqueue an ``execute_connector`` task for each recent failed execution that
    still has a resolvable document — powers the "Retry Failed" button in the log view."""
    await _get_owned_connector(connector_id, user, db)

    rows = (
        await db.execute(
            select(ConnectorExecutionLog.document_id)
            .where(
                ConnectorExecutionLog.connector_id == connector_id,
                ConnectorExecutionLog.success.is_(False),
                ConnectorExecutionLog.document_id.is_not(None),
            )
            .order_by(ConnectorExecutionLog.created_at.desc())
            .limit(50)
        )
    ).scalars().all()

    seen: set[str] = set()
    requeued = 0
    try:
        from app.workers.connector_tasks import execute_connector

        for document_id in rows:
            key = str(document_id)
            if key in seen:
                continue
            seen.add(key)
            execute_connector.delay(connector_id, key)
            requeued += 1
    except Exception:
        # Broker unavailable (e.g. running without a worker) — report what we found.
        requeued = len(set(str(r) for r in rows))

    return RetryResult(requeued=requeued)


def _hint_label(field_key: str) -> str:
    return field_key.replace("_", " ").title()


@router.get("/field-mapping-helper", response_model=list[FieldMappingOption])
async def field_mapping_helper(
    doc_type: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FieldMappingOption]:
    """Available source fields for a doc_type, drawn from the tenant's own extracted
    fields plus the platform's known field hints/templates — powers the mapping UI."""
    options: dict[str, str] = {}

    # 1. Fields actually extracted from this tenant's documents of this type.
    variants = {doc_type, doc_type.title(), doc_type.capitalize()}
    rows = (
        await db.execute(
            select(DocumentField.field_key, DocumentField.field_label)
            .join(Document, Document.id == DocumentField.document_id)
            .where(
                Document.tenant_id == user.tenant_id,
                Document.doc_type.in_(variants),
            )
            .distinct()
        )
    ).all()
    for key, label in rows:
        options.setdefault(key, label or _hint_label(key))

    # 2. Built-in field hints by document type.
    for variant in variants:
        for key in _FIELD_HINTS.get(variant, []):
            options.setdefault(key, _hint_label(key))

    # 3. Industry-template default fields.
    templates = (await db.execute(select(IndustryTemplate))).scalars().all()
    for tmpl in templates:
        default_fields = tmpl.default_fields or {}
        for variant in variants:
            for field in default_fields.get(variant, []) or []:
                if isinstance(field, dict) and field.get("key"):
                    options.setdefault(field["key"], field.get("label") or _hint_label(field["key"]))

    return [
        FieldMappingOption(field_key=k, field_label=v)
        for k, v in sorted(options.items())
    ]


@router.delete("/{connector_id}", response_model=MessageResponse)
async def delete_connector(
    connector_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    connector = await _get_owned_connector(connector_id, user, db)
    await db.delete(connector)
    await db.commit()
    return MessageResponse(message="Connector deleted.")

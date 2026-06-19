"""Async document processing pipeline executed as a Celery task.

The DB layer is async (asyncpg), so the task body runs inside ``asyncio.run``.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.analytics import DailyStat
from app.models.batch import Batch
from app.models.connector import Connector
from app.models.document import Document, DocumentEvent, DocumentField
from app.models.tenant import Tenant
from app.services.ai_service import ai_service
from app.services.ocr_service import ocr_service
from app.services.storage_service import storage_service
from app.services.webhook_service import webhook_service
from app.utils.crypto import decrypt_string
from app.utils.pubsub import publish_document_event
from app.workers.celery_app import celery_app

_VALIDATION_THRESHOLD = 0.70
_TERMINAL_STATUSES = {"complete", "exception", "rejected"}


async def _trigger_webhook(tenant_id, event_type: str, payload: dict) -> None:
    """Fire a tenant webhook event without ever breaking the pipeline."""
    try:
        await webhook_service.trigger(str(tenant_id), event_type, payload)
    except Exception:
        pass


async def _maybe_batch_completed(db, document: Document) -> None:
    """Mark a batch completed (and fire ``batch.completed``) once all of its
    active documents have reached a terminal status."""
    if not document.batch_id:
        return
    rows = await db.execute(
        select(Document.status).where(
            Document.batch_id == document.batch_id, Document.is_active.is_(True)
        )
    )
    statuses = [r[0] for r in rows.all()]
    if not statuses or any(s not in _TERMINAL_STATUSES for s in statuses):
        return
    batch = await db.get(Batch, document.batch_id)
    if batch is None or batch.status == "completed":
        return
    batch.status = "completed"
    await db.commit()
    await _trigger_webhook(
        document.tenant_id,
        "batch.completed",
        {
            "batch_id": str(batch.id),
            "name": batch.name,
            "doc_count": len(statuses),
        },
    )


async def _publish_update(document: Document, confidence: float | None = None) -> None:
    """Best-effort real-time broadcast of a document's current state."""
    try:
        await asyncio.to_thread(
            publish_document_event,
            str(document.tenant_id),
            {
                "type": "document_updated",
                "document_id": str(document.id),
                "status": document.status,
                "doc_type": document.doc_type,
                "confidence": confidence,
            },
        )
    except Exception:
        pass


def _connector_matches(connector, doc_type: str | None) -> bool:
    """A connector fires when the event is subscribed and (optionally) the
    document type matches the connector's configured ``doc_type_filter``."""
    events = connector.trigger_events or ["document.completed"]
    if "document.completed" not in events:
        return False
    if not (connector.base_url or connector.request_template):
        return False
    try:
        config = json.loads(
            decrypt_string(connector.config_enc, settings.encryption_secret)
        )
    except Exception:
        config = {}
    doc_filter = (config or {}).get("doc_type_filter")
    if doc_filter and doc_type and str(doc_filter).lower() != str(doc_type).lower():
        return False
    return True


async def _dispatch_connectors(db, document: Document) -> None:
    """Enqueue every matching connector for a freshly-completed document."""
    try:
        from app.workers.connector_tasks import execute_connector

        connectors = (
            await db.execute(
                select(Connector).where(Connector.tenant_id == document.tenant_id)
            )
        ).scalars().all()
        for connector in connectors:
            if _connector_matches(connector, document.doc_type):
                execute_connector.delay(str(connector.id), str(document.id))
    except Exception:
        pass


async def _safe_cluster(document_id: str) -> None:
    """Final pipeline step for non-clean docs: cluster by root cause for the
    Exception Resolution Center. Never breaks the pipeline."""
    try:
        from app.services.exception_clustering_service import (
            exception_clustering_service,
        )

        await exception_clustering_service.cluster_document(document_id)
    except Exception:
        pass


async def _emit_event(db, document_id: str, event_type: str, metadata: dict) -> None:
    db.add(
        DocumentEvent(
            document_id=document_id,
            event_type=event_type,
            actor_id=None,
            event_metadata=metadata or {},
        )
    )
    await db.flush()


async def _set_status(db, document: Document, status: str, event_meta: dict) -> None:
    document.status = status
    await _emit_event(db, document.id, f"status_{status}", event_meta)
    await db.commit()
    await _publish_update(document)


def _resolve_ai_key(tenant: Tenant) -> str:
    if not tenant.ai_api_key_enc:
        return ""
    try:
        return decrypt_string(tenant.ai_api_key_enc, settings.encryption_secret)
    except Exception:
        return ""


async def _update_daily_stats(
    db, tenant_id: str, avg_confidence: float, processing_ms: int, is_exception: bool
) -> None:
    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(DailyStat).where(
            DailyStat.tenant_id == tenant_id, DailyStat.date == today
        )
    )
    stat = result.scalar_one_or_none()

    if stat is None:
        db.add(
            DailyStat(
                tenant_id=tenant_id,
                date=today,
                docs_processed=1,
                docs_exceptions=1 if is_exception else 0,
                avg_confidence=avg_confidence,
                avg_processing_ms=processing_ms,
            )
        )
    else:
        prev = stat.docs_processed or 0
        stat.avg_confidence = (
            (stat.avg_confidence * prev + avg_confidence) / (prev + 1)
            if prev
            else avg_confidence
        )
        stat.avg_processing_ms = int(
            (stat.avg_processing_ms * prev + processing_ms) / (prev + 1)
            if prev
            else processing_ms
        )
        stat.docs_processed = prev + 1
        if is_exception:
            stat.docs_exceptions = (stat.docs_exceptions or 0) + 1
    await db.commit()


async def _process(document_id: str) -> None:
    started = time.perf_counter()

    async with AsyncSessionLocal() as db:
        document = await db.get(Document, document_id)
        if document is None:
            return
        tenant = await db.get(Tenant, document.tenant_id)
        tenant_id = document.tenant_id

        try:
            # Step 1-2: OCR
            await _set_status(db, document, "ocr", {})
            file_bytes = await storage_service.download_file(document.storage_path)
            ocr_text = await ocr_service.extract_text(file_bytes, document.file_type)
            document.ocr_text = ocr_text
            await db.commit()

            # Step 3-4: classify
            await _set_status(db, document, "classifying", {})
            provider = tenant.ai_provider if tenant else "claude"
            api_key = _resolve_ai_key(tenant) if tenant else ""
            classification = await ai_service.classify_document(
                ocr_text, provider, api_key
            )
            document.doc_type = classification["doc_type"]
            await _emit_event(db, document.id, "classified", classification)
            await db.commit()

            # Step 5-6: extract fields
            await _set_status(db, document, "extracting", {})
            fields = await ai_service.extract_fields(
                ocr_text, document.doc_type, provider, api_key
            )
            for f in fields:
                db.add(
                    DocumentField(
                        document_id=document.id,
                        field_key=f["field_key"],
                        field_label=f["field_label"],
                        raw_value=f["raw_value"],
                        confidence=f["confidence"],
                    )
                )
            await db.flush()

            # Step 7: route on confidence
            confidences = [f["confidence"] for f in fields]
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
            needs_validation = (not fields) or any(
                c < _VALIDATION_THRESHOLD for c in confidences
            )

            if needs_validation:
                document.status = "validating"
                await _emit_event(
                    db, document.id, "needs_validation", {"avg_confidence": avg_conf}
                )
            else:
                document.status = "complete"
                document.completed_at = datetime.now(timezone.utc)
                await _emit_event(
                    db, document.id, "completed", {"avg_confidence": avg_conf}
                )
            await db.commit()
            await _publish_update(document, confidence=avg_conf)

            if document.status == "complete":
                await _trigger_webhook(
                    tenant_id,
                    "document.completed",
                    {
                        "document_id": str(document.id),
                        "doc_type": document.doc_type,
                        "status": document.status,
                        "confidence": avg_conf,
                    },
                )
                await _maybe_batch_completed(db, document)
                # Fan out to every matching outbound connector.
                await _dispatch_connectors(db, document)

            # Step 8: analytics
            processing_ms = int((time.perf_counter() - started) * 1000)
            await _update_daily_stats(
                db, tenant_id, avg_conf, processing_ms, is_exception=False
            )

            # Step 9: root-cause clustering for anything needing attention.
            if document.status == "validating":
                await _safe_cluster(document_id)

        except Exception as exc:  # noqa: BLE001 - we re-raise after recording
            await db.rollback()
            document = await db.get(Document, document_id)
            if document is not None:
                document.status = "exception"
                await _emit_event(
                    db, document.id, "error", {"message": str(exc)}
                )
                await db.commit()
                await _publish_update(document)
                await _trigger_webhook(
                    tenant_id,
                    "document.exception",
                    {
                        "document_id": str(document.id),
                        "doc_type": document.doc_type,
                        "status": "exception",
                        "message": str(exc),
                    },
                )
                await _maybe_batch_completed(db, document)
            processing_ms = int((time.perf_counter() - started) * 1000)
            try:
                await _update_daily_stats(
                    db, tenant_id, 0.0, processing_ms, is_exception=True
                )
            except Exception:
                pass
            # Cluster the failure so it surfaces in the Exception Resolution Center.
            await _safe_cluster(document_id)
            raise


@celery_app.task(name="process_document", bind=True, max_retries=2)
def process_document(self, document_id: str) -> str:
    asyncio.run(_process(document_id))
    return document_id

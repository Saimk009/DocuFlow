"""Periodic email ingestion.

Every few minutes, poll each tenant's configured ``email`` connector over IMAP,
turn PDF/image attachments into documents, and enqueue them for processing.
"""
from __future__ import annotations

import asyncio
import json
import logging

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.connector import Connector
from app.models.document import Document, DocumentEvent
from app.services.email_service import EmailIngestionService, FetchedEmail
from app.services.storage_service import storage_service
from app.utils.crypto import decrypt_string
from app.workers.celery_app import celery_app

logger = logging.getLogger("docuflow.email")


def _connect_and_fetch(service: EmailIngestionService) -> list[FetchedEmail]:
    service.connect_imap()
    return service.fetch_unseen_emails()


async def _ingest_for_connector(db, connector: Connector) -> int:
    try:
        config = json.loads(decrypt_string(connector.config_enc, settings.encryption_secret))
    except Exception:
        logger.warning("Could not decrypt config for connector %s", connector.id)
        return 0

    host = config.get("host")
    username = config.get("username")
    password = config.get("password")
    try:
        port = int(config.get("port") or 993)
    except (TypeError, ValueError):
        port = 993

    if not (host and username and password):
        return 0

    service = EmailIngestionService(host, port, username, password)
    try:
        emails = await asyncio.to_thread(_connect_and_fetch, service)
    except Exception as exc:  # noqa: BLE001
        logger.warning("IMAP fetch failed for connector %s: %s", connector.id, exc)
        return 0

    from app.workers.document_tasks import process_document

    created = 0
    try:
        for em in emails:
            ingested_any = False
            for att in em.attachments:
                ext = att.filename.rsplit(".", 1)[-1].lower() if "." in att.filename else ""
                try:
                    storage_path = await storage_service.upload_file(
                        tenant_id=str(connector.tenant_id),
                        file_bytes=att.content,
                        filename=att.filename,
                        content_type=att.content_type,
                    )
                    document = Document(
                        tenant_id=connector.tenant_id,
                        filename=att.filename,
                        storage_path=storage_path,
                        file_type=ext,
                        status="captured",
                    )
                    db.add(document)
                    await db.flush()
                    db.add(
                        DocumentEvent(
                            document_id=document.id,
                            event_type="email_ingested",
                            actor_id=None,
                            event_metadata={
                                "from": em.sender,
                                "subject": em.subject,
                                "connector_id": str(connector.id),
                            },
                        )
                    )
                    await db.commit()
                    await db.refresh(document)
                    process_document.delay(str(document.id))
                    created += 1
                    ingested_any = True
                except Exception as exc:  # noqa: BLE001
                    await db.rollback()
                    logger.warning(
                        "Failed to ingest attachment %s: %s", att.filename, exc
                    )
            # Only mark seen once we've attempted ingestion for this message.
            if ingested_any:
                try:
                    await asyncio.to_thread(service.mark_seen, em.uid)
                except Exception:  # noqa: BLE001
                    pass
    finally:
        await asyncio.to_thread(service.logout)

    return created


async def _poll() -> int:
    async with AsyncSessionLocal() as db:
        connectors = (
            await db.execute(select(Connector).where(Connector.type == "email"))
        ).scalars().all()

    total = 0
    for connector in connectors:
        async with AsyncSessionLocal() as db:
            total += await _ingest_for_connector(db, connector)

    if total:
        logger.info("Email ingestion created %s document(s)", total)
    return total


@celery_app.task(name="poll_email_inboxes")
def poll_email_inboxes() -> int:
    return asyncio.run(_poll())

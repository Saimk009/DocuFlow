"""Outbound connector dispatch as a Celery task.

When a document completes, the pipeline enqueues one ``execute_connector`` task per
matching connector. Each task runs the generic connector engine and, on failure,
records a document event and feeds the failure into the Exception Resolution Center
so recurring integration breakages are grouped by connector.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.connector import Connector
from app.models.document import Document, DocumentEvent, DocumentField
from app.services.connector_engine import connector_engine
from app.workers.celery_app import celery_app


async def _execute(connector_id: str, document_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        connector = await db.get(Connector, connector_id)
        document = await db.get(Document, document_id)
        if connector is None or document is None:
            return {"success": False, "error_message": "connector or document missing"}

        fields = (
            await db.execute(
                select(DocumentField).where(DocumentField.document_id == document_id)
            )
        ).scalars().all()

        result = await connector_engine.execute(connector, document, list(fields))

        if not result.get("success"):
            db.add(
                DocumentEvent(
                    document_id=document.id,
                    event_type="integration_failed",
                    actor_id=None,
                    event_metadata={
                        "connector_id": str(connector.id),
                        "connector_name": connector.name,
                        "message": f"Integration failed: {connector.name}",
                        "error": result.get("error_message"),
                        "status_code": result.get("status_code"),
                    },
                )
            )
            await db.commit()
            connector_name = connector.name
        else:
            connector_name = None

    # Cluster the failure (separate session inside the clustering service).
    if connector_name is not None:
        try:
            from app.services.exception_clustering_service import (
                exception_clustering_service,
            )

            await exception_clustering_service.cluster_integration_failure(
                document_id, connector_name, result.get("error_message")
            )
        except Exception:
            pass

    return result


@celery_app.task(name="execute_connector", bind=True, max_retries=0)
def execute_connector(self, connector_id: str, document_id: str) -> dict:
    return asyncio.run(_execute(connector_id, document_id))

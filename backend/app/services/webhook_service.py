"""Outbound webhook delivery with HMAC signing and retries.

Each delivery is signed with the webhook's secret so receivers can verify
authenticity:

    signature = HMAC_SHA256(secret, raw_body)
    header    = X-DocuFlow-Signature: sha256=<hexdigest>
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.connector import Webhook

logger = logging.getLogger("docuflow.webhooks")

_MAX_ATTEMPTS = 3
_TIMEOUT_SECONDS = 10.0


def sign_payload(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class WebhookService:
    @staticmethod
    def _matches(webhook: Webhook, event_type: str) -> bool:
        # An empty event list subscribes to everything.
        events = webhook.events or []
        return not events or event_type in events

    async def _deliver(self, url: str, secret: str, body: bytes, event_type: str) -> bool:
        headers = {
            "Content-Type": "application/json",
            "X-DocuFlow-Event": event_type,
            "X-DocuFlow-Signature": sign_payload(secret, body),
        }
        delay = 1.0
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            for attempt in range(1, _MAX_ATTEMPTS + 1):
                try:
                    resp = await client.post(url, content=body, headers=headers)
                    if 200 <= resp.status_code < 300:
                        return True
                    logger.warning(
                        "Webhook %s returned %s (attempt %s/%s)",
                        url,
                        resp.status_code,
                        attempt,
                        _MAX_ATTEMPTS,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning(
                        "Webhook %s failed: %s (attempt %s/%s)",
                        url,
                        exc,
                        attempt,
                        _MAX_ATTEMPTS,
                    )
                if attempt < _MAX_ATTEMPTS:
                    await asyncio.sleep(delay)
                    delay *= 2  # exponential backoff: 1s, 2s, 4s
        return False

    async def trigger(
        self, tenant_id: str, event_type: str, payload: dict[str, Any]
    ) -> int:
        """Fan ``event_type`` out to all matching active webhooks for the tenant.

        Returns the number of successful deliveries. Never raises — webhook
        delivery is best-effort and must not break the calling pipeline.
        """
        try:
            async with AsyncSessionLocal() as db:
                webhooks = (
                    await db.execute(
                        select(Webhook).where(
                            Webhook.tenant_id == tenant_id, Webhook.is_active.is_(True)
                        )
                    )
                ).scalars().all()

            targets = [w for w in webhooks if self._matches(w, event_type)]
            if not targets:
                return 0

            envelope = json.dumps(
                {
                    "event": event_type,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": payload,
                },
                default=str,
            ).encode("utf-8")

            results = await asyncio.gather(
                *(self._deliver(w.url, w.secret, envelope, event_type) for w in targets),
                return_exceptions=True,
            )
            return sum(1 for r in results if r is True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Webhook trigger failed for %s: %s", event_type, exc)
            return 0


webhook_service = WebhookService()

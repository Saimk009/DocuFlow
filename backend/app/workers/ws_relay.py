"""Redis -> WebSocket relay.

Runs as a long-lived asyncio task inside the API process (started in the app
lifespan). It pattern-subscribes to ``tenant:*:docs`` and fans each message out
to the matching tenant's live WebSocket connections via the shared
:class:`ConnectionManager`.
"""
from __future__ import annotations

import asyncio
import json
import logging

import redis.asyncio as redis

from app.config import settings
from app.utils.pubsub import DOC_CHANNEL_PATTERN
from app.utils.ws_manager import manager

logger = logging.getLogger("docuflow.ws_relay")


def _tenant_from_channel(channel: str) -> str | None:
    # Channel format: ``tenant:<tenant_id>:docs``
    parts = channel.split(":")
    if len(parts) == 3 and parts[0] == "tenant" and parts[2] == "docs":
        return parts[1]
    return None


async def run_relay() -> None:
    """Subscribe to the document event pattern and broadcast forever.

    Reconnects with backoff if Redis becomes unavailable. Cancellation (on app
    shutdown) propagates out cleanly.
    """
    client = redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    while True:
        try:
            pubsub = client.pubsub()
            await pubsub.psubscribe(DOC_CHANNEL_PATTERN)
            logger.info("WS relay subscribed to %s", DOC_CHANNEL_PATTERN)
            async for message in pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                channel = message.get("channel", "")
                tenant_id = _tenant_from_channel(channel)
                if tenant_id is None:
                    continue
                try:
                    payload = json.loads(message["data"])
                except (ValueError, TypeError):
                    continue
                await manager.broadcast_to_tenant(tenant_id, payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("WS relay error, retrying in 3s: %s", exc)
            await asyncio.sleep(3)

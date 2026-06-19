"""Redis pub/sub helpers for real-time document events.

The Celery worker runs each task inside a fresh ``asyncio.run`` loop, which makes
sharing the async Redis client (bound to a different loop) unsafe. Publishing is
therefore done through a lazily-created *synchronous* Redis client, while the API
process consumes events with the async client in :mod:`app.workers.ws_relay`.
"""
from __future__ import annotations

import json
from typing import Any

import redis as sync_redis

from app.config import settings

# Channel pattern consumed by the relay: ``tenant:<tenant_id>:docs``.
DOC_CHANNEL_PATTERN = "tenant:*:docs"

_client: sync_redis.Redis | None = None


def _get_client() -> sync_redis.Redis:
    global _client
    if _client is None:
        _client = sync_redis.from_url(
            settings.REDIS_URL, encoding="utf-8", decode_responses=True
        )
    return _client


def doc_channel(tenant_id: str) -> str:
    return f"tenant:{tenant_id}:docs"


def publish_document_event(tenant_id: str, message: dict[str, Any]) -> None:
    """Best-effort publish of a document event. Never raises."""
    try:
        _get_client().publish(doc_channel(tenant_id), json.dumps(message, default=str))
    except Exception:
        # Real-time updates are non-critical; processing must not fail on them.
        pass

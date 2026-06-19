"""Async Redis client + JWT blacklist helpers (used for logout)."""
from __future__ import annotations

import redis.asyncio as redis

from app.config import settings

redis_client: redis.Redis = redis.from_url(
    settings.REDIS_URL, encoding="utf-8", decode_responses=True
)

_BLACKLIST_PREFIX = "jwt:blacklist:"


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    await redis_client.set(f"{_BLACKLIST_PREFIX}{jti}", "1", ex=ttl_seconds)


async def is_token_blacklisted(jti: str) -> bool:
    return bool(await redis_client.exists(f"{_BLACKLIST_PREFIX}{jti}"))

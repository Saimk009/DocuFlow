"""Real-time document updates over WebSocket.

Clients connect to ``/ws/{tenant_id}?token=<jwt>``. The token is verified, the
tenant is checked against the token's claim, and the socket is registered with
the :class:`ConnectionManager`. The Redis relay (:mod:`app.workers.ws_relay`)
pushes ``document_updated`` events to every connected socket for the tenant.
"""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.models.document import Document
from app.models.user import User
from app.utils.redis_client import is_token_blacklisted
from app.utils.security import JWTError, decode_token
from app.utils.ws_manager import manager

router = APIRouter(tags=["realtime"])


async def _status_counts(tenant_id: str) -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Document.status, func.count())
                .where(Document.tenant_id == tenant_id, Document.is_active.is_(True))
                .group_by(Document.status)
            )
        ).all()
    return {status_: count for status_, count in rows}


async def _authenticate(token: str | None, tenant_id: str) -> bool:
    """Validate the JWT and confirm it belongs to ``tenant_id``."""
    if not token:
        return False
    try:
        payload = decode_token(token)
    except JWTError:
        return False

    if payload.get("sub") is None:
        return False
    if str(payload.get("tenant_id")) != str(tenant_id):
        return False

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        return False

    # Ensure the user still exists and is active.
    async with AsyncSessionLocal() as db:
        user = (
            await db.execute(select(User).where(User.id == payload["sub"]))
        ).scalar_one_or_none()
    return user is not None and user.is_active


@router.websocket("/ws/{tenant_id}")
async def document_updates(
    websocket: WebSocket,
    tenant_id: str,
    token: str | None = Query(default=None),
) -> None:
    if not await _authenticate(token, tenant_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, tenant_id)
    try:
        # Initial snapshot: active document counts per status.
        await manager.send_personal(
            websocket,
            {"type": "initial_state", "counts": await _status_counts(tenant_id)},
        )
        # Keep the socket open; we only need to detect disconnects. Any inbound
        # text (e.g. a heartbeat "ping") is acknowledged with a "pong".
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, tenant_id)

"""In-process WebSocket connection registry.

Tracks live WebSocket connections per tenant so the Redis relay can fan out
``document_updated`` events to every browser tab connected for that tenant.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, tenant_id: str) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.setdefault(tenant_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, tenant_id: str) -> None:
        conns = self.active_connections.get(tenant_id)
        if not conns:
            return
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.active_connections.pop(tenant_id, None)

    def connection_count(self, tenant_id: str) -> int:
        return len(self.active_connections.get(tenant_id, []))

    async def send_personal(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(message, default=str))

    async def broadcast_to_tenant(self, tenant_id: str, message: dict[str, Any]) -> None:
        """Serialize ``message`` to JSON and send to all of the tenant's sockets.

        Dead connections are pruned silently so a single broken socket never
        blocks delivery to the rest.
        """
        conns = list(self.active_connections.get(tenant_id, []))
        if not conns:
            return
        payload = json.dumps(message, default=str)
        stale: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws, tenant_id)


# Module-level singleton shared by the WS endpoint and the Redis relay.
manager = ConnectionManager()

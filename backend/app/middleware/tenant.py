"""Subdomain -> tenant resolution middleware.

Resolves the active tenant from the request's ``Host`` header and attaches it to
``request.state.tenant``. Public/admin hosts (no subdomain, bare apex, localhost,
or raw IPs) resolve to ``None`` and are allowed through so that public routes
(register, login, health, docs) keep working.
"""
from __future__ import annotations

import ipaddress

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.database import AsyncSessionLocal
from app.models.tenant import Tenant

# Hosts that never carry a tenant subdomain.
_PUBLIC_HOSTS = {"localhost", "docuflow.com", "www.docuflow.com", "127.0.0.1"}

# Path prefixes reachable without a tenant context.
_PUBLIC_PATH_PREFIXES = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/check-slug",
    "/api/v1/auth/accept-invite",
    "/api/v1/admin",
)


def extract_slug(host: str | None) -> str | None:
    if not host:
        return None
    hostname = host.split(":")[0].strip().lower()
    if not hostname or hostname in _PUBLIC_HOSTS:
        return None
    try:
        ipaddress.ip_address(hostname)
        return None
    except ValueError:
        pass
    parts = hostname.split(".")
    # Need at least sub.domain.tld for a subdomain to exist.
    if len(parts) < 3:
        return None
    sub = parts[0]
    if sub in {"www", "app", "api"}:
        return None
    return sub


def _is_public_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in _PUBLIC_PATH_PREFIXES)


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Prefer the subdomain (production). Fall back to the explicit
        # ``X-Tenant-Slug`` header so local dev (localhost, no subdomain) and
        # non-DNS clients can still carry tenant context.
        slug = extract_slug(request.headers.get("host"))
        if slug is None:
            header_slug = request.headers.get("x-tenant-slug")
            if header_slug:
                slug = header_slug.strip().lower() or None
        request.state.tenant = None

        if slug is not None:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Tenant).where(
                        Tenant.slug == slug, Tenant.is_active.is_(True)
                    )
                )
                tenant = result.scalar_one_or_none()

            if tenant is None:
                return JSONResponse(
                    status_code=404,
                    content={"detail": f"No active organization found for '{slug}'."},
                )
            request.state.tenant = tenant
        elif not _is_public_path(request.url.path):
            # No subdomain on a protected route -> tenant context is required.
            return JSONResponse(
                status_code=404,
                content={"detail": "Organization not found. Use your team subdomain."},
            )

        return await call_next(request)

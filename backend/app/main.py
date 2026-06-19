import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.middleware.tenant import TenantMiddleware
from app.routers import (
    admin,
    analytics,
    auth,
    batches,
    cases,
    connectors,
    documents,
    exceptions,
    onboarding,
    robots,
    settings as settings_router,
    workflows,
    ws,
)
from app.workers.ws_relay import run_relay


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch the Redis -> WebSocket relay.
    relay_task = asyncio.create_task(run_relay())
    yield
    # Shutdown
    relay_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await relay_task
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="DocuFlow API",
        version="0.1.0",
        description="Enterprise Intelligent Document Processing platform",
        lifespan=lifespan,
    )

    # Order matters: add_middleware wraps outermost-last, so register the
    # tenant resolver first and CORS last (CORS stays the outermost layer).
    app.add_middleware(TenantMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(documents.router)
    app.include_router(exceptions.router)
    app.include_router(batches.router)
    app.include_router(workflows.router)
    app.include_router(robots.router)
    app.include_router(cases.router)
    app.include_router(analytics.router)
    app.include_router(connectors.router)
    app.include_router(admin.router)
    app.include_router(settings_router.router)
    app.include_router(onboarding.router)
    app.include_router(ws.router)

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok", "version": "1.0.0"}

    return app


app = create_app()

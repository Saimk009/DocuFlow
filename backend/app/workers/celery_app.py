"""Celery application configured with the Redis broker/backend."""
from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "docuflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.document_tasks",
        "app.workers.robot_tasks",
        "app.workers.email_tasks",
        "app.workers.connector_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "poll-email-inboxes": {
            "task": "poll_email_inboxes",
            "schedule": 300.0,  # every 5 minutes
        },
    },
)

"""RPA robot execution as a Celery task.

Steps are simulated: each step appends a log entry and pauses briefly. Supported
step types: http_request, extract_text, fill_field, decision, notify.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.database import AsyncSessionLocal
from app.models.robot import Robot, RobotRun
from app.workers.celery_app import celery_app

_SUPPORTED_STEPS = {"http_request", "extract_text", "fill_field", "decision", "notify"}
_STEP_DELAY_SECONDS = 0.5


def _log(step_index: int, step_type: str, status: str, message: str) -> dict:
    return {
        "step": step_index,
        "type": step_type,
        "status": status,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def _run(robot_run_id: str) -> None:
    async with AsyncSessionLocal() as db:
        run = await db.get(RobotRun, robot_run_id)
        if run is None:
            return
        robot = await db.get(Robot, run.robot_id)

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        logs: list[dict] = []
        run.logs_json = logs
        if robot is not None:
            robot.status = "running"
        await db.commit()

        try:
            definition = (robot.definition_json if robot else {}) or {}
            steps = definition.get("steps", [])
            if not isinstance(steps, list):
                steps = []

            processed = 0
            for idx, step in enumerate(steps, start=1):
                step_type = step.get("type", "unknown")
                if step_type not in _SUPPORTED_STEPS:
                    logs = logs + [
                        _log(idx, step_type, "skipped", f"Unsupported step type '{step_type}'.")
                    ]
                    run.logs_json = logs
                    await db.commit()
                    continue

                logs = logs + [_log(idx, step_type, "started", f"Executing {step_type}.")]
                run.logs_json = logs
                await db.commit()

                await asyncio.sleep(_STEP_DELAY_SECONDS)

                label = step.get("label", step_type)
                logs = logs + [_log(idx, step_type, "completed", f"{label} done.")]
                run.logs_json = logs
                processed += 1
                run.items_processed = processed
                await db.commit()

            run.status = "completed"
            run.finished_at = datetime.now(timezone.utc)
            run.items_processed = processed
            logs = logs + [_log(len(steps) + 1, "summary", "completed", f"Processed {processed} step(s).")]
            run.logs_json = logs
            if robot is not None:
                robot.status = "idle"
            await db.commit()

        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            run = await db.get(RobotRun, robot_run_id)
            if run is not None:
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc)
                run.error_message = str(exc)
                existing = run.logs_json or []
                run.logs_json = existing + [_log(0, "error", "failed", str(exc))]
            robot = await db.get(Robot, run.robot_id) if run else None
            if robot is not None:
                robot.status = "idle"
            await db.commit()
            raise


@celery_app.task(name="run_robot", bind=True, max_retries=0)
def run_robot(self, robot_run_id: str) -> str:
    asyncio.run(_run(robot_run_id))
    return robot_run_id

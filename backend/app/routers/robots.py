"""Robot (RPA) routes (/api/v1/robots). Tenant-scoped."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.robot import Robot, RobotRun
from app.models.user import User

router = APIRouter(prefix="/api/v1/robots", tags=["robots"])

_VALID_TRIGGERS = {"manual", "schedule", "event"}


class RobotCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    trigger_type: str = "manual"
    schedule_cron: str | None = None
    definition_json: dict[str, Any] = Field(default_factory=dict)


class RobotUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    schedule_cron: str | None = None
    definition_json: dict[str, Any] | None = None
    status: str | None = None


class RobotRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    robot_id: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    items_processed: int
    error_message: str | None = None


class RobotRunDetail(RobotRunOut):
    logs_json: list[Any] = Field(default_factory=list)


class RobotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    trigger_type: str
    schedule_cron: str | None = None
    definition_json: dict[str, Any]
    status: str
    created_by: str | None = None
    created_at: datetime
    last_run: RobotRunOut | None = None
    next_run: datetime | None = None


class RobotListResponse(BaseModel):
    items: list[RobotOut]
    total: int
    page: int
    pages: int


class RunListResponse(BaseModel):
    items: list[RobotRunOut]
    total: int
    page: int
    pages: int


class RunTriggerResponse(BaseModel):
    run_id: str
    status: str


class MessageResponse(BaseModel):
    message: str


def _compute_next_run(schedule_cron: str | None) -> datetime | None:
    if not schedule_cron:
        return None
    try:
        from croniter import croniter

        base = datetime.now(timezone.utc)
        return croniter(schedule_cron, base).get_next(datetime)
    except Exception:
        return None


def _validate_trigger(trigger_type: str, schedule_cron: str | None) -> None:
    if trigger_type not in _VALID_TRIGGERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"trigger_type must be one of: {', '.join(sorted(_VALID_TRIGGERS))}.",
        )
    if trigger_type == "schedule" and not schedule_cron:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="schedule_cron is required when trigger_type is 'schedule'.",
        )


async def _get_owned_robot(robot_id: str, user: User, db: AsyncSession) -> Robot:
    robot = await db.get(Robot, robot_id)
    if robot is None or str(robot.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Robot not found.")
    return robot


async def _last_run(db: AsyncSession, robot_id: str) -> RobotRun | None:
    return (
        await db.execute(
            select(RobotRun)
            .where(RobotRun.robot_id == robot_id)
            .order_by(desc(RobotRun.started_at))
            .limit(1)
        )
    ).scalar_one_or_none()


@router.post("", response_model=RobotOut, status_code=status.HTTP_201_CREATED)
async def create_robot(
    payload: RobotCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RobotOut:
    _validate_trigger(payload.trigger_type, payload.schedule_cron)
    robot = Robot(
        tenant_id=user.tenant_id,
        name=payload.name,
        description=payload.description,
        trigger_type=payload.trigger_type,
        schedule_cron=payload.schedule_cron,
        definition_json=payload.definition_json or {"steps": []},
        status="idle",
        created_by=user.id,
    )
    db.add(robot)
    await db.commit()
    await db.refresh(robot)
    out = RobotOut.model_validate(robot)
    out.next_run = _compute_next_run(robot.schedule_cron)
    return out


@router.get("", response_model=RobotListResponse)
async def list_robots(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RobotListResponse:
    total = (
        await db.execute(
            select(func.count()).select_from(Robot).where(Robot.tenant_id == user.tenant_id)
        )
    ).scalar_one()
    robots = (
        await db.execute(
            select(Robot)
            .where(Robot.tenant_id == user.tenant_id)
            .order_by(Robot.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars().all()

    items = []
    for r in robots:
        out = RobotOut.model_validate(r)
        last = await _last_run(db, r.id)
        out.last_run = RobotRunOut.model_validate(last) if last else None
        out.next_run = _compute_next_run(r.schedule_cron)
        items.append(out)
    pages = (total + page_size - 1) // page_size if total else 0
    return RobotListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/{robot_id}", response_model=RobotOut)
async def get_robot(
    robot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RobotOut:
    robot = await _get_owned_robot(robot_id, user, db)
    out = RobotOut.model_validate(robot)
    last = await _last_run(db, robot.id)
    out.last_run = RobotRunOut.model_validate(last) if last else None
    out.next_run = _compute_next_run(robot.schedule_cron)
    return out


@router.put("/{robot_id}", response_model=RobotOut)
async def update_robot(
    robot_id: str,
    payload: RobotUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RobotOut:
    robot = await _get_owned_robot(robot_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    trigger_type = data.get("trigger_type", robot.trigger_type)
    schedule_cron = data.get("schedule_cron", robot.schedule_cron)
    _validate_trigger(trigger_type, schedule_cron)
    for key, value in data.items():
        setattr(robot, key, value)
    await db.commit()
    await db.refresh(robot)
    out = RobotOut.model_validate(robot)
    out.next_run = _compute_next_run(robot.schedule_cron)
    return out


@router.post("/{robot_id}/run", response_model=RunTriggerResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_robot_now(
    robot_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RunTriggerResponse:
    from app.workers.robot_tasks import run_robot

    robot = await _get_owned_robot(robot_id, user, db)
    run = RobotRun(robot_id=robot.id, status="running")
    db.add(run)
    await db.commit()
    await db.refresh(run)

    run_robot.delay(str(run.id))
    return RunTriggerResponse(run_id=str(run.id), status=run.status)


@router.get("/{robot_id}/runs", response_model=RunListResponse)
async def list_runs(
    robot_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RunListResponse:
    await _get_owned_robot(robot_id, user, db)
    total = (
        await db.execute(
            select(func.count()).select_from(RobotRun).where(RobotRun.robot_id == robot_id)
        )
    ).scalar_one()
    runs = (
        await db.execute(
            select(RobotRun)
            .where(RobotRun.robot_id == robot_id)
            .order_by(desc(RobotRun.started_at))
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars().all()
    items = [RobotRunOut.model_validate(r) for r in runs]
    pages = (total + page_size - 1) // page_size if total else 0
    return RunListResponse(items=items, total=total, page=page, pages=pages)


@router.get("/{robot_id}/runs/{run_id}", response_model=RobotRunDetail)
async def get_run(
    robot_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RobotRunDetail:
    await _get_owned_robot(robot_id, user, db)
    run = await db.get(RobotRun, run_id)
    if run is None or str(run.robot_id) != str(robot_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return RobotRunDetail.model_validate(run)

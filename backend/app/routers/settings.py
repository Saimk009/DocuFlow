"""Tenant settings & user management routes (/api/v1/settings)."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.invitation import Invitation
from app.models.tenant import Tenant
from app.models.user import User
from app.utils.crypto import encrypt_string

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

_MANAGER_ROLES = {"owner", "admin"}
_VALID_ROLES = {"owner", "admin", "member", "viewer"}
_INVITE_TTL_DAYS = 7


class TenantSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    plan: str
    ai_provider: str
    has_api_key: bool = False
    logo_url: str | None = None


class TenantSettingsUpdate(BaseModel):
    name: str | None = None
    ai_provider: str | None = None
    ai_api_key: str | None = None
    logo_url: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: str
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = "member"


class InviteOut(BaseModel):
    id: str
    email: EmailStr
    role: str
    invite_token: str
    expires_at: datetime


class RoleUpdate(BaseModel):
    role: str = Field(...)


class MessageResponse(BaseModel):
    message: str


def _require_manager(user: User) -> None:
    if user.role not in _MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can perform this action.",
        )


async def _tenant(db: AsyncSession, user: User) -> Tenant:
    tenant = await db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return tenant


@router.get("", response_model=TenantSettingsOut)
async def get_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantSettingsOut:
    tenant = await _tenant(db, user)
    out = TenantSettingsOut.model_validate(tenant)
    out.has_api_key = bool(tenant.ai_api_key_enc)
    return out


@router.put("", response_model=TenantSettingsOut)
async def update_settings(
    payload: TenantSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantSettingsOut:
    _require_manager(user)
    tenant = await _tenant(db, user)

    if payload.name is not None:
        tenant.name = payload.name
    if payload.ai_provider is not None:
        if payload.ai_provider not in {"claude", "openai"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ai_provider must be 'claude' or 'openai'.",
            )
        tenant.ai_provider = payload.ai_provider
    if payload.ai_api_key is not None:
        tenant.ai_api_key_enc = (
            encrypt_string(payload.ai_api_key, app_settings.encryption_secret)
            if payload.ai_api_key
            else None
        )
    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url

    await db.commit()
    await db.refresh(tenant)
    out = TenantSettingsOut.model_validate(tenant)
    out.has_api_key = bool(tenant.ai_api_key_enc)
    return out


@router.get("/users", response_model=list[UserOut])
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
    rows = (
        await db.execute(
            select(User).where(User.tenant_id == user.tenant_id).order_by(User.created_at)
        )
    ).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


@router.post("/users/invite", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def invite_user(
    payload: InviteCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InviteOut:
    _require_manager(user)
    role = payload.role.lower()
    if role not in _VALID_ROLES - {"owner"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role must be one of: admin, member, viewer.",
        )
    email = payload.email.lower()
    existing = (
        await db.execute(
            select(User).where(User.email == email, User.tenant_id == user.tenant_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists in your organization.",
        )

    invitation = Invitation(
        tenant_id=user.tenant_id,
        email=email,
        role=role,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=_INVITE_TTL_DAYS),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return InviteOut(
        id=str(invitation.id),
        email=invitation.email,
        role=invitation.role,
        invite_token=invitation.token,
        expires_at=invitation.expires_at,
    )


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def remove_user(
    user_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    _require_manager(user)
    if str(user_id) == str(user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove yourself."
        )
    target = await db.get(User, user_id)
    if target is None or str(target.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The owner cannot be removed."
        )
    await db.delete(target)
    await db.commit()
    return MessageResponse(message="User removed.")


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def change_role(
    user_id: str,
    payload: RoleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    _require_manager(user)
    role = payload.role.lower()
    if role not in _VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Role must be one of: {', '.join(sorted(_VALID_ROLES))}.",
        )
    target = await db.get(User, user_id)
    if target is None or str(target.tenant_id) != str(user.tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target.role == "owner" and role != "owner":
        # Ensure at least one owner remains.
        owner_count = (
            await db.execute(
                select(func.count())
                .select_from(User)
                .where(User.tenant_id == user.tenant_id, User.role == "owner")
            )
        ).scalar_one()
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last owner.",
            )
    target.role = role
    await db.commit()
    await db.refresh(target)
    return UserOut.model_validate(target)

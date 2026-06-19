"""Authentication & onboarding routes (/api/v1/auth)."""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.invitation import Invitation
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import (
    AcceptInviteRequest,
    InviteRequest,
    InviteResponse,
    LoginRequest,
    MeResponse,
    MessageResponse,
    RegisterRequest,
    TenantInfo,
    TokenResponse,
    UserInfo,
)
from app.utils.redis_client import blacklist_token
from app.utils.security import (
    JWTError,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_logout_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_INVITE_TTL_DAYS = 7
_VALID_INVITE_ROLES = {"admin", "member", "viewer"}


def slugify(value: str) -> str:
    slug = value.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug


@router.get("/check-slug")
async def check_slug(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Live availability check for an organization subdomain slug."""
    normalized = slugify(slug)
    valid = 3 <= len(normalized) <= 30 and bool(_SLUG_RE.match(normalized))
    if not valid:
        return {
            "slug": normalized,
            "valid": False,
            "available": False,
            "reason": "Slug must be 3-30 chars: lowercase letters, numbers and hyphens.",
        }
    exists = (
        await db.execute(select(Tenant.id).where(Tenant.slug == normalized))
    ).first()
    return {
        "slug": normalized,
        "valid": True,
        "available": exists is None,
        "reason": None if exists is None else "This subdomain is already taken.",
    }


def _token_response(user: User, tenant: Tenant) -> TokenResponse:
    token, _ = create_access_token(
        subject=str(user.id),
        tenant_id=str(user.tenant_id),
        role=user.role,
        email=user.email,
    )
    return TokenResponse(
        access_token=token,
        user=UserInfo.model_validate(user),
        tenant=TenantInfo.model_validate(tenant),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    slug = slugify(payload.org_slug)
    if not (3 <= len(slug) <= 30) or not _SLUG_RE.match(slug):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Slug must be 3-30 chars, lowercase letters, numbers and hyphens only.",
        )

    existing = await db.execute(select(Tenant).where(Tenant.slug == slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Organization slug '{slug}' is already taken.",
        )

    tenant = Tenant(
        slug=slug,
        name=payload.org_name,
        onboarding_started_at=datetime.now(timezone.utc),
    )
    db.add(tenant)
    await db.flush()  # populate tenant.id

    user = User(
        tenant_id=tenant.id,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role="owner",
        full_name=payload.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await db.refresh(tenant)

    return _token_response(user, tenant)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    email = payload.email.lower()
    tenant: Tenant | None = getattr(request.state, "tenant", None)

    if tenant is not None:
        result = await db.execute(
            select(User).where(User.email == email, User.tenant_id == tenant.id)
        )
        user = result.scalar_one_or_none()
    else:
        # No subdomain context: resolve by email, but it must be unambiguous.
        result = await db.execute(select(User).where(User.email == email))
        users = result.scalars().all()
        if len(users) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email belongs to multiple organizations. Log in via your team subdomain.",
            )
        user = users[0] if users else None
        if user is not None:
            tenant = await db.get(Tenant, user.tenant_id)

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled."
        )
    if tenant is None or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Organization is inactive."
        )

    return _token_response(user, tenant)


@router.get("/me", response_model=MeResponse)
async def me(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> MeResponse:
    tenant = await db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found."
        )
    return MeResponse(
        user=UserInfo.model_validate(user), tenant=TenantInfo.model_validate(tenant)
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(token: str | None = Depends(_logout_scheme)) -> MessageResponse:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated."
        )
    try:
        payload = decode_token(token)
    except JWTError:
        # Already invalid/expired -> nothing to revoke.
        return MessageResponse(message="Logged out.")

    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        ttl = int(exp - datetime.now(timezone.utc).timestamp())
        await blacklist_token(jti, ttl)
    return MessageResponse(message="Logged out.")


@router.post("/invite", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
async def invite(
    payload: InviteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InviteResponse:
    if user.role not in {"owner", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners and admins can invite members.",
        )
    role = payload.role.lower()
    if role not in _VALID_INVITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Role must be one of: {', '.join(sorted(_VALID_INVITE_ROLES))}.",
        )

    email = payload.email.lower()
    existing_user = await db.execute(
        select(User).where(User.email == email, User.tenant_id == user.tenant_id)
    )
    if existing_user.scalar_one_or_none() is not None:
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

    return InviteResponse(
        id=str(invitation.id),
        email=invitation.email,
        role=invitation.role,
        invite_token=invitation.token,
        expires_at=invitation.expires_at,
    )


@router.post("/accept-invite", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def accept_invite(
    payload: AcceptInviteRequest, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    result = await db.execute(
        select(Invitation).where(Invitation.token == payload.token)
    )
    invitation = result.scalar_one_or_none()
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invitation token."
        )
    if invitation.accepted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This invitation has already been accepted.",
        )

    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="This invitation has expired."
        )

    existing = await db.execute(
        select(User).where(
            User.email == invitation.email, User.tenant_id == invitation.tenant_id
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email.",
        )

    user = User(
        tenant_id=invitation.tenant_id,
        email=invitation.email,
        password_hash=hash_password(payload.password),
        role=invitation.role,
        full_name=payload.full_name,
    )
    db.add(user)
    invitation.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    tenant = await db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found."
        )
    return _token_response(user, tenant)

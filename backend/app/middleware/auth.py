"""Authentication & authorization dependencies."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.tenant import Tenant
from app.models.user import User
from app.utils.redis_client import is_token_blacklisted
from app.utils.security import JWTError, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise _CREDENTIALS_EXC

    try:
        payload = decode_token(token)
    except JWTError:
        raise _CREDENTIALS_EXC

    user_id = payload.get("sub")
    jti = payload.get("jti")
    if user_id is None:
        raise _CREDENTIALS_EXC

    if jti and await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise _CREDENTIALS_EXC

    return user


def get_current_tenant(request: Request) -> Tenant:
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenant context for this request.",
        )
    return tenant


def require_role(*roles: str):
    """Dependency factory: ensure the current user has one of ``roles``."""

    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(roles)}.",
            )
        return user

    return _checker


async def require_super_admin(user: User = Depends(get_current_user)) -> User:
    """Platform super-admin gate (matches ``SUPER_ADMIN_EMAIL``)."""
    if user.email.lower() != settings.SUPER_ADMIN_EMAIL.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin privileges required.",
        )
    return user

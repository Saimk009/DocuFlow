from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=255)
    org_slug: str = Field(..., min_length=3, max_length=30)
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="member")


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class TenantInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    plan: str
    ai_provider: str
    logo_url: str | None = None


class UserInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: str
    avatar_url: str | None = None
    tenant_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
    tenant: TenantInfo


class MeResponse(BaseModel):
    user: UserInfo
    tenant: TenantInfo


class InviteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    role: str
    invite_token: str
    expires_at: datetime


class MessageResponse(BaseModel):
    message: str

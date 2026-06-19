from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    field_key: str
    field_label: str
    raw_value: str
    validated_value: str | None = None
    confidence: float
    is_validated: bool
    validator_id: str | None = None
    validated_at: datetime | None = None


class DocumentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    event_type: str
    actor_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, alias="event_metadata")
    created_at: datetime


class DocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    file_type: str
    page_count: int
    status: str
    doc_type: str | None = None
    batch_id: str | None = None
    workflow_id: str | None = None
    assigned_to: str | None = None
    field_count: int = 0
    event_count: int = 0
    avg_confidence: float | None = None
    created_at: datetime
    completed_at: datetime | None = None


class DocumentDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    file_type: str
    page_count: int
    status: str
    doc_type: str | None = None
    batch_id: str | None = None
    workflow_id: str | None = None
    assigned_to: str | None = None
    ocr_text: str | None = None
    file_url: str | None = None
    fields: list[DocumentFieldOut] = Field(default_factory=list)
    events: list[DocumentEventOut] = Field(default_factory=list)
    created_at: datetime
    completed_at: datetime | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentSummary]
    total: int
    page: int
    pages: int


class FieldUpdate(BaseModel):
    field_id: str
    validated_value: str


class StatusUpdate(BaseModel):
    action: Literal["approve", "reject", "flag", "reassign"]
    assigned_to: str | None = None
    reason: str | None = None


class UploadedDocument(BaseModel):
    id: str
    filename: str
    status: str


class MessageResponse(BaseModel):
    message: str

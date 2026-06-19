"""Document export to CSV / JSON and single-document extraction reports."""
from __future__ import annotations

import csv
import io
import json
from typing import Any

from app.models.document import Document


def _avg_confidence(document: Document) -> float | None:
    fields = document.fields or []
    if not fields:
        return None
    return round(sum(f.confidence for f in fields) / len(fields), 4)


def _field_value(field: Any) -> str:
    return field.validated_value if field.validated_value is not None else field.raw_value


class ExportService:
    @staticmethod
    def generate_extraction_report(
        document: Document,
        batch_name: str | None = None,
        workflow_name: str | None = None,
    ) -> dict[str, Any]:
        """Full report for a single document (used for JSON export & API)."""
        return {
            "doc_id": str(document.id),
            "filename": document.filename,
            "doc_type": document.doc_type,
            "status": document.status,
            "confidence": _avg_confidence(document),
            "batch_name": batch_name,
            "workflow_name": workflow_name,
            "page_count": document.page_count,
            "created_at": document.created_at.isoformat() if document.created_at else None,
            "processed_at": (
                document.completed_at.isoformat() if document.completed_at else None
            ),
            "fields": [
                {
                    "field_key": f.field_key,
                    "field_label": f.field_label,
                    "value": _field_value(f),
                    "raw_value": f.raw_value,
                    "confidence": f.confidence,
                    "is_validated": f.is_validated,
                }
                for f in (document.fields or [])
            ],
        }

    @staticmethod
    def export_to_csv(
        documents: list[Document],
        batch_names: dict[str, str] | None = None,
        workflow_names: dict[str, str] | None = None,
    ) -> bytes:
        batch_names = batch_names or {}
        workflow_names = workflow_names or {}

        # Build a stable, sorted union of every field key so each extracted
        # field becomes its own flattened column.
        field_keys: list[str] = sorted(
            {f.field_key for d in documents for f in (d.fields or [])}
        )

        base_columns = [
            "doc_id",
            "filename",
            "doc_type",
            "status",
            "confidence",
            "batch_name",
            "workflow_name",
            "processed_at",
        ]
        header = base_columns + [f"field.{k}" for k in field_keys]

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(header)

        for d in documents:
            values_by_key = {f.field_key: _field_value(f) for f in (d.fields or [])}
            avg = _avg_confidence(d)
            row = [
                str(d.id),
                d.filename,
                d.doc_type or "",
                d.status,
                f"{avg:.4f}" if avg is not None else "",
                batch_names.get(str(d.batch_id), "") if d.batch_id else "",
                workflow_names.get(str(d.workflow_id), "") if d.workflow_id else "",
                d.completed_at.isoformat() if d.completed_at else "",
            ]
            row += [values_by_key.get(k, "") for k in field_keys]
            writer.writerow(row)

        return buffer.getvalue().encode("utf-8")

    @staticmethod
    def export_to_json(
        documents: list[Document],
        batch_names: dict[str, str] | None = None,
        workflow_names: dict[str, str] | None = None,
    ) -> bytes:
        batch_names = batch_names or {}
        workflow_names = workflow_names or {}
        reports = [
            ExportService.generate_extraction_report(
                d,
                batch_name=batch_names.get(str(d.batch_id)) if d.batch_id else None,
                workflow_name=workflow_names.get(str(d.workflow_id))
                if d.workflow_id
                else None,
            )
            for d in documents
        ]
        return json.dumps(
            {"count": len(reports), "documents": reports}, indent=2, default=str
        ).encode("utf-8")


export_service = ExportService()

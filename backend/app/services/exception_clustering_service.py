"""Root-cause clustering for failed / low-confidence documents.

The Exception Resolution Center groups documents by a deterministic *signature*
that captures the "shape" of a failure (e.g. the tax field is always low-confidence
on invoices). Same root cause -> same group, so systemic problems surface once and
can be fixed in bulk instead of being triaged one document at a time.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.document import Document, DocumentField
from app.models.exception import ExceptionGroup, ExceptionGroupMember
from app.models.tenant import Tenant
from app.services.ai_service import ai_service
from app.utils.crypto import decrypt_string

# Mirror the pipeline's validation threshold so groupings line up with routing.
_CONFIDENCE_THRESHOLD = 0.70
_VENDOR_HINT_MIN = 3  # how many docs must share a vendor before we flag it
_SUGGESTION_CACHE_TTL = 3600  # seconds (1 hour)
_OPEN_STATUSES = ("open", "investigating")


def _text_hash(value: str) -> str:
    return hashlib.md5(value.strip().lower().encode("utf-8", "ignore")).hexdigest()[:10]


def _is_garbled(text: str | None) -> bool:
    """Empty or low-signal OCR output (mostly non-letters) -> treat as OCR failure."""
    if not text or not text.strip():
        return True
    stripped = text.strip()
    if len(stripped) < 12:
        return True
    letters = sum(1 for c in stripped if c.isalnum() or c.isspace())
    return (letters / len(stripped)) < 0.55


def _lowest_confidence_field(fields: list[DocumentField]) -> DocumentField | None:
    candidates = [f for f in fields if f.confidence < _CONFIDENCE_THRESHOLD]
    if not candidates:
        return None
    return min(candidates, key=lambda f: f.confidence)


def _category_for(signature: str) -> str:
    prefix = signature.split("::", 1)[0]
    known = {
        "low_confidence",
        "unclassified",
        "missing_field",
        "ocr_failure",
        "duplicate",
        "timeout",
        "integration_failure",
    }
    return prefix if prefix in known else "low_confidence"


class ExceptionClusteringService:
    @staticmethod
    def compute_signature(
        document: Document,
        fields: list[DocumentField],
        *,
        is_duplicate: bool = False,
    ) -> str:
        """Deterministic fingerprint identifying the *shape* of a failure.

        Priority is ordered from most-fundamental to most-specific so the signature
        reflects the true root cause rather than a downstream symptom.
        """
        doc_type = document.doc_type

        # 1. OCR produced nothing usable — nothing downstream can succeed.
        if _is_garbled(document.ocr_text):
            return f"ocr_failure::{(document.file_type or 'unknown').lower()}"

        # 2. Exact duplicate of an earlier document.
        if is_duplicate:
            return f"duplicate::{_text_hash(document.ocr_text or document.filename)}"

        # 3. Classifier could not place it into a known type.
        if not doc_type or doc_type.lower() == "other":
            return f"unclassified::{_text_hash((document.ocr_text or '')[:2000])}"

        # 4. Nothing extracted at all.
        if not fields:
            return f"missing_field::{doc_type}::__none__"

        # 5. A specific field is consistently low-confidence.
        worst = _lowest_confidence_field(fields)
        if worst is not None:
            return f"low_confidence::{doc_type}::{worst.field_key}"

        # 6. A required-looking field came back empty.
        empty = next((f for f in fields if not (f.raw_value or "").strip()), None)
        if empty is not None:
            return f"missing_field::{doc_type}::{empty.field_key}"

        # Fallback: generic low-confidence on this doc type.
        return f"low_confidence::{doc_type}::overall"

    # ── internals ────────────────────────────────────────────────────────────
    @staticmethod
    def _resolve_ai(tenant: Tenant | None) -> tuple[str, str]:
        provider = tenant.ai_provider if tenant else "claude"
        if not tenant or not tenant.ai_api_key_enc:
            return provider, ""
        try:
            return provider, decrypt_string(
                tenant.ai_api_key_enc, settings.encryption_secret
            )
        except Exception:
            return provider, ""

    @staticmethod
    def _fallback_label(category: str, doc_type: str | None, field_label: str | None) -> str:
        dt = doc_type or "incoming"
        fl = field_label or "a field"
        return {
            "low_confidence": f"{fl} consistently low-confidence on {dt} documents",
            "unclassified": "Documents can't be matched to a known type",
            "missing_field": f"Expected fields missing on {dt} documents",
            "ocr_failure": f"Text extraction is failing on these {dt} files",
            "duplicate": "Duplicate documents are being submitted",
            "timeout": f"Processing is timing out on {dt} documents",
            "vendor_format_change": f"A vendor changed their {dt} layout",
            "integration_failure": f"Sending {dt} documents to {fl} keeps failing",
        }.get(category, f"Recurring issue on {dt} documents")

    async def _detect_duplicate(self, db: AsyncSession, document: Document) -> bool:
        text = (document.ocr_text or "").strip()
        if len(text) < 40:
            return False
        row = await db.execute(
            select(Document.id)
            .where(
                Document.tenant_id == document.tenant_id,
                Document.id != document.id,
                Document.is_active.is_(True),
                Document.ocr_text == document.ocr_text,
                Document.created_at < document.created_at,
            )
            .limit(1)
        )
        return row.first() is not None

    async def _field_label_for(
        self, db: AsyncSession, document: Document, signature: str
    ) -> str | None:
        """Human label of the affected field (for low_confidence / missing_field)."""
        parts = signature.split("::")
        if len(parts) < 3 or parts[2] in ("__none__", "overall"):
            return None
        field_key = parts[2]
        match = next((f for f in document.fields if f.field_key == field_key), None)
        return match.field_label if match else field_key

    async def _generate_label(
        self,
        tenant: Tenant | None,
        signature: str,
        category: str,
        doc_type: str | None,
        field_label: str | None,
    ) -> str:
        provider, api_key = self._resolve_ai(tenant)
        details = (
            f"category={category}; doc_type={doc_type or 'unknown'}; "
            f"affected_field={field_label or 'n/a'}; signature={signature}"
        )
        system = (
            "You write short, plain-English failure explanations for a non-technical "
            "operations user. No jargon. No preamble. Return only the sentence."
        )
        user = (
            f"Given this document-processing failure pattern: {details}. "
            "Write a one-sentence plain-English explanation a non-technical user "
            "would understand. Max 15 words."
        )
        text = await ai_service.complete(
            system=system, user=user, provider=provider, api_key=api_key
        )
        text = text.strip().strip('"').splitlines()[0] if text else ""
        if not text:
            return self._fallback_label(category, doc_type, field_label)
        # Keep it tight (~15 words).
        words = text.split()
        if len(words) > 18:
            text = " ".join(words[:18])
        return text

    async def _maybe_vendor_hint(
        self, db: AsyncSession, group: ExceptionGroup
    ) -> str | None:
        """If 3+ documents in this group share the same vendor_name, surface it and
        reclassify the group as a (more specific) vendor format change."""
        if (group.doc_type or "").lower() != "invoice":
            return None
        rows = await db.execute(
            select(DocumentField.raw_value)
            .join(
                ExceptionGroupMember,
                ExceptionGroupMember.document_id == DocumentField.document_id,
            )
            .where(
                ExceptionGroupMember.exception_group_id == group.id,
                DocumentField.field_key == "vendor_name",
            )
        )
        counts: dict[str, int] = {}
        for (value,) in rows.all():
            key = (value or "").strip()
            if key:
                counts[key] = counts.get(key, 0) + 1
        if not counts:
            return None
        vendor, count = max(counts.items(), key=lambda kv: kv[1])
        return vendor if count >= _VENDOR_HINT_MIN else None

    # ── public API ───────────────────────────────────────────────────────────
    async def cluster_document(self, document_id: str) -> ExceptionGroup | None:
        async with AsyncSessionLocal() as db:
            document = (
                await db.execute(
                    select(Document).where(Document.id == document_id)
                )
            ).scalar_one_or_none()
            if document is None:
                return None

            fields = list(document.fields)
            is_duplicate = await self._detect_duplicate(db, document)
            signature = self.compute_signature(
                document, fields, is_duplicate=is_duplicate
            )
            category = _category_for(signature)
            field_label = await self._field_label_for(db, document, signature)
            now = datetime.now(timezone.utc)

            group = (
                await db.execute(
                    select(ExceptionGroup).where(
                        ExceptionGroup.tenant_id == document.tenant_id,
                        ExceptionGroup.root_cause_signature == signature,
                        ExceptionGroup.status.in_(_OPEN_STATUSES),
                    )
                )
            ).scalar_one_or_none()

            if group is None:
                tenant = await db.get(Tenant, document.tenant_id)
                label = await self._generate_label(
                    tenant, signature, category, document.doc_type, field_label
                )
                group = ExceptionGroup(
                    tenant_id=document.tenant_id,
                    root_cause_signature=signature,
                    root_cause_label=label,
                    category=category,
                    affected_field=field_label,
                    doc_type=document.doc_type,
                    status="open",
                    document_count=0,
                    first_seen_at=now,
                    last_seen_at=now,
                )
                db.add(group)
                await db.flush()

            # Add membership (idempotent — a re-processed doc won't double-count).
            existing_member = (
                await db.execute(
                    select(ExceptionGroupMember.id).where(
                        ExceptionGroupMember.exception_group_id == group.id,
                        ExceptionGroupMember.document_id == document.id,
                    )
                )
            ).first()
            if existing_member is None:
                db.add(
                    ExceptionGroupMember(
                        exception_group_id=group.id, document_id=document.id
                    )
                )
                group.document_count = (group.document_count or 0) + 1
            group.last_seen_at = now
            await db.flush()

            # Vendor format-change detection (more specific than low_confidence).
            vendor = await self._maybe_vendor_hint(db, group)
            if vendor and group.vendor_hint != vendor:
                group.vendor_hint = vendor
                if category in ("low_confidence", "missing_field"):
                    group.category = "vendor_format_change"

            await db.commit()
            await db.refresh(group)
            return group

    async def cluster_integration_failure(
        self, document_id: str, connector_name: str, error_message: str | None = None
    ) -> ExceptionGroup | None:
        """Surface a failed downstream integration in the Exception Resolution
        Center, grouped by connector so a single config fix clears them all."""
        async with AsyncSessionLocal() as db:
            document = await db.get(Document, document_id)
            if document is None:
                return None

            signature = f"integration_failure::{connector_name}"
            now = datetime.now(timezone.utc)

            group = (
                await db.execute(
                    select(ExceptionGroup).where(
                        ExceptionGroup.tenant_id == document.tenant_id,
                        ExceptionGroup.root_cause_signature == signature,
                        ExceptionGroup.status.in_(_OPEN_STATUSES),
                    )
                )
            ).scalar_one_or_none()

            if group is None:
                label = (
                    f"Sending documents to {connector_name} keeps failing"
                    + (f" ({error_message})" if error_message else "")
                )
                group = ExceptionGroup(
                    tenant_id=document.tenant_id,
                    root_cause_signature=signature,
                    root_cause_label=label[:512],
                    category="integration_failure",
                    affected_field=connector_name,
                    doc_type=document.doc_type,
                    status="open",
                    document_count=0,
                    first_seen_at=now,
                    last_seen_at=now,
                )
                db.add(group)
                await db.flush()

            existing_member = (
                await db.execute(
                    select(ExceptionGroupMember.id).where(
                        ExceptionGroupMember.exception_group_id == group.id,
                        ExceptionGroupMember.document_id == document.id,
                    )
                )
            ).first()
            if existing_member is None:
                db.add(
                    ExceptionGroupMember(
                        exception_group_id=group.id, document_id=document.id
                    )
                )
                group.document_count = (group.document_count or 0) + 1
            group.last_seen_at = now

            await db.commit()
            await db.refresh(group)
            return group

    async def suggest_resolution(self, exception_group_id: str) -> dict:
        """AI-assisted fix suggestion for a group. Cached in Redis for 1 hour."""
        cache_key = f"exc:suggest:{exception_group_id}"
        try:
            from app.utils.redis_client import redis_client

            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            redis_client = None  # type: ignore[assignment]

        async with AsyncSessionLocal() as db:
            group = await db.get(ExceptionGroup, exception_group_id)
            if group is None:
                return {"suggestion": "", "confidence": 0.0}

            sample_rows = await db.execute(
                select(Document.ocr_text)
                .join(
                    ExceptionGroupMember,
                    ExceptionGroupMember.document_id == Document.id,
                )
                .where(ExceptionGroupMember.exception_group_id == group.id)
                .limit(3)
            )
            samples = [
                (t or "")[:1500] for (t,) in sample_rows.all() if t
            ]
            tenant = await db.get(Tenant, group.tenant_id)

        result = await self._build_suggestion(group, samples, tenant)

        try:
            if redis_client is not None:
                await redis_client.set(
                    cache_key, json.dumps(result), ex=_SUGGESTION_CACHE_TTL
                )
        except Exception:
            pass
        return result

    async def _build_suggestion(
        self, group: ExceptionGroup, samples: list[str], tenant: Tenant | None
    ) -> dict:
        canned = {
            "low_confidence": (
                "Consider lowering the confidence threshold for this field, or this "
                "vendor's documents may need a custom extraction hint."
            ),
            "vendor_format_change": (
                "This vendor appears to have changed their invoice template. Review one "
                "document and the rest can be bulk-corrected."
            ),
            "unclassified": (
                "Add a document-type example or rule so the classifier can recognize "
                "this format going forward."
            ),
            "missing_field": (
                "The expected field isn't present in these documents — confirm it's "
                "required, or add an extraction hint for where it appears."
            ),
            "ocr_failure": (
                "These files scan poorly. Re-upload higher-resolution copies or enable "
                "image pre-processing before OCR."
            ),
            "duplicate": (
                "These look like duplicates already in the system. Safe to reject the "
                "repeats in bulk."
            ),
            "timeout": (
                "Processing is timing out — try smaller batches or split multi-page "
                "documents."
            ),
            "integration_failure": (
                "The downstream system is rejecting these requests. Check the connector's "
                "auth, base URL, and field mapping, then retry from the connector logs."
            ),
        }
        fallback = canned.get(group.category, canned["low_confidence"])

        provider, api_key = self._resolve_ai(tenant)
        if not api_key or not samples:
            return {"suggestion": fallback, "confidence": 0.55}

        joined = "\n\n---\n\n".join(samples)
        system = (
            "You are an IDP operations assistant. Suggest one concrete, actionable fix "
            "for a recurring document-processing failure. 1-2 sentences, plain English."
        )
        user = (
            f"Failure category: {group.category}\n"
            f"Affected field: {group.affected_field or 'n/a'}\n"
            f"Document type: {group.doc_type or 'unknown'}\n"
            f"Vendor hint: {group.vendor_hint or 'n/a'}\n\n"
            f"Sample document text from affected documents:\n{joined}\n\n"
            "Suggest the single best fix."
        )
        suggestion = await ai_service.complete(
            system=system, user=user, provider=provider, api_key=api_key
        )
        suggestion = suggestion.strip() if suggestion else ""
        if not suggestion:
            return {"suggestion": fallback, "confidence": 0.55}
        return {"suggestion": suggestion, "confidence": 0.82}


exception_clustering_service = ExceptionClusteringService()

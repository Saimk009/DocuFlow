"""LLM-backed document classification and field extraction.

Supports Anthropic (Claude) and OpenAI providers. All calls use httpx async and
fail soft: classification returns an ``Other`` fallback and extraction returns an
empty list rather than raising into the pipeline.
"""
from __future__ import annotations

import json
import re

import httpx

CLAUDE_MODEL = "claude-sonnet-4-6"
OPENAI_MODEL = "gpt-4o"
_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_TIMEOUT = 60.0

_CLASSIFY_SYSTEM = (
    "You are a document classification engine. Classify the document into one of:\n"
    "Invoice, Contract, Identity Document, Form, Statement, Receipt, Report, Other.\n"
    'Return ONLY valid JSON: {"doc_type": "...", "confidence": 0.0-1.0, "reasoning": "..."}'
)

_EXTRACT_SYSTEM = "Return ONLY a JSON array of field objects. No markdown."

_FIELD_HINTS: dict[str, list[str]] = {
    "Invoice": [
        "vendor_name", "vendor_address", "invoice_number", "invoice_date", "due_date",
        "po_number", "subtotal", "tax_amount", "total_amount", "currency", "payment_terms",
    ],
    "Contract": [
        "parties", "effective_date", "expiry_date", "contract_value",
        "governing_law", "signatory",
    ],
    "Identity Document": [
        "full_name", "dob", "id_number", "id_type", "nationality",
        "expiry_date", "address",
    ],
    "Form": ["form_title", "submitter_name", "submission_date"],
}

_CLASSIFY_FALLBACK = {
    "doc_type": "Other",
    "confidence": 0.0,
    "reasoning": "Classification failed",
}


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _extract_json(text: str, expect_array: bool = False):
    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Best-effort: grab the first JSON object/array substring.
    opener, closer = ("[", "]") if expect_array else ("{", "}")
    start = cleaned.find(opener)
    end = cleaned.rfind(closer)
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


class AIService:
    async def _call_provider(
        self, *, provider: str, api_key: str, system: str, user: str
    ) -> str:
        provider = (provider or "claude").lower()
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            if provider == "openai":
                resp = await client.post(
                    _OPENAI_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": OPENAI_MODEL,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user},
                        ],
                        "temperature": 0,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]

            # Default: Anthropic Claude
            resp = await client.post(
                _ANTHROPIC_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 2048,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]

    async def complete(
        self, *, system: str, user: str, provider: str, api_key: str
    ) -> str:
        """Generic single-shot completion. Fails soft to an empty string so callers
        can fall back to deterministic copy without breaking."""
        if not api_key:
            return ""
        try:
            raw = await self._call_provider(
                provider=provider, api_key=api_key, system=system, user=user
            )
            return _strip_code_fences(raw).strip()
        except Exception:
            return ""

    async def classify_document(
        self, ocr_text: str, provider: str, api_key: str
    ) -> dict:
        user = f"Classify the following document text:\n\n{ocr_text[:12000]}"
        try:
            raw = await self._call_provider(
                provider=provider, api_key=api_key, system=_CLASSIFY_SYSTEM, user=user
            )
            parsed = _extract_json(raw, expect_array=False)
            if not isinstance(parsed, dict) or "doc_type" not in parsed:
                return dict(_CLASSIFY_FALLBACK)
            return {
                "doc_type": str(parsed.get("doc_type", "Other")),
                "confidence": float(parsed.get("confidence", 0.0)),
                "reasoning": str(parsed.get("reasoning", "")),
            }
        except Exception:
            return dict(_CLASSIFY_FALLBACK)

    @staticmethod
    def _build_extract_prompt(ocr_text: str, doc_type: str) -> str:
        hints = _FIELD_HINTS.get(doc_type)
        if doc_type == "Form":
            instruction = (
                "Extract these fields: form_title, submitter_name, submission_date, "
                "plus any detected key-value pairs."
            )
        elif hints:
            instruction = f"Extract these fields: {', '.join(hints)}."
        else:
            instruction = "Extract all visible key-value pairs."
        return (
            f"{instruction}\n"
            "For each field return an object with keys: field_key, field_label, "
            "raw_value, confidence (0.0-1.0).\n\n"
            f"Document text:\n{ocr_text[:12000]}"
        )

    async def extract_fields(
        self, ocr_text: str, doc_type: str, provider: str, api_key: str
    ) -> list[dict]:
        user = self._build_extract_prompt(ocr_text, doc_type)
        try:
            raw = await self._call_provider(
                provider=provider, api_key=api_key, system=_EXTRACT_SYSTEM, user=user
            )
            parsed = _extract_json(raw, expect_array=True)
            if not isinstance(parsed, list):
                return []
            fields: list[dict] = []
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                key = item.get("field_key") or item.get("key")
                if not key:
                    continue
                fields.append(
                    {
                        "field_key": str(key),
                        "field_label": str(item.get("field_label", key)),
                        "raw_value": "" if item.get("raw_value") is None else str(item.get("raw_value")),
                        "confidence": float(item.get("confidence", 0.0)),
                    }
                )
            return fields
        except Exception:
            return []


ai_service = AIService()

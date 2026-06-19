"""Generic, configurable REST connector engine.

A tenant configures *what* to send (field mappings + a request template) and *how*
to authenticate (api key / bearer / basic / oauth2). The engine interpolates the
document's extracted fields into the outbound request, attaches auth, sends it with
retries/backoff, and records a redacted execution log — no per-system code required.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.connector import Connector
from app.models.connector_log import ConnectorExecutionLog
from app.models.document import Document, DocumentField
from app.utils.crypto import decrypt_string, encrypt_string

_TIMEOUT = 15.0
_MAX_RETRIES = 3
_BACKOFF_BASE = 0.5  # seconds: 0.5, 1.0, 2.0
_BODY_TRUNCATE = 2000
_PLACEHOLDER = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")
_REDACTED = "***REDACTED***"
_SENSITIVE_HEADERS = {"authorization", "x-api-key", "api-key", "apikey"}


# ── pure helpers ──────────────────────────────────────────────────────────────
def _field_values(fields: list[DocumentField]) -> dict[str, str]:
    """field_key -> validated value (falling back to the raw extracted value)."""
    out: dict[str, str] = {}
    for f in fields:
        value = f.validated_value if f.validated_value not in (None, "") else f.raw_value
        out[f.field_key] = "" if value is None else str(value)
    return out


def _to_iso_date(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    # Try ISO first, then a handful of common layouts.
    candidates = [
        "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d-%m-%Y",
        "%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y", "%Y/%m/%d",
    ]
    try:
        return datetime.fromisoformat(raw).date().isoformat()
    except ValueError:
        pass
    for fmt in candidates:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw  # leave untouched if unparseable


def _to_currency_cents(value: str) -> int | str:
    cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
    if not cleaned:
        return value
    try:
        return int(round(float(cleaned) * 100))
    except ValueError:
        return value


def _apply_transform(value: str, transform: str | None) -> Any:
    t = (transform or "none").lower()
    if t == "uppercase":
        return str(value).upper()
    if t == "date_iso":
        return _to_iso_date(value)
    if t == "currency_cents":
        return _to_currency_cents(value)
    return value


def _interpolate(template: str, values: dict[str, str]) -> str:
    return _PLACEHOLDER.sub(lambda m: values.get(m.group(1), ""), template)


def _set_nested(body: dict, path: str, value: Any) -> None:
    """Set a dot-notation path like ``$.invoice.vendor.name`` on a nested dict."""
    clean = path.strip()
    if clean.startswith("$."):
        clean = clean[2:]
    elif clean.startswith("$"):
        clean = clean[1:]
    parts = [p for p in clean.split(".") if p]
    if not parts:
        return
    cursor = body
    for part in parts[:-1]:
        nxt = cursor.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            cursor[part] = nxt
        cursor = nxt
    cursor[parts[-1]] = value


def _redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {
        k: (_REDACTED if k.lower() in _SENSITIVE_HEADERS else v)
        for k, v in headers.items()
    }


class ConnectorEngine:
    # ── config decoding ─────────────────────────────────────────────────────
    @staticmethod
    def _auth_config(connector: Connector) -> dict[str, Any]:
        if not connector.auth_config_enc:
            return {}
        try:
            data = json.loads(
                decrypt_string(connector.auth_config_enc, settings.encryption_secret)
            )
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    # ── body / header construction ────────────────────────────────────────────
    def build_body(
        self, connector: Connector, fields: list[DocumentField]
    ) -> Any:
        values = _field_values(fields)
        template = connector.request_template or {}
        body: Any = {}

        # 1. body_template scaffolding with {{field_key}} interpolation.
        raw_template = template.get("body_template")
        if isinstance(raw_template, str) and raw_template.strip():
            interpolated = _interpolate(raw_template, values)
            try:
                body = json.loads(interpolated)
            except json.JSONDecodeError:
                # Not JSON — send the interpolated string as the raw body.
                return interpolated
        elif isinstance(raw_template, dict):
            body = json.loads(_interpolate(json.dumps(raw_template), values))

        if not isinstance(body, dict):
            body = {}

        # 2. Field mappings -> nested target paths with transforms.
        mappings = connector.field_mappings or []
        for m in mappings:
            if not isinstance(m, dict):
                continue
            source = m.get("source_field")
            target = m.get("target_path")
            if not source or not target:
                continue
            transformed = _apply_transform(values.get(source, ""), m.get("transform"))
            _set_nested(body, target, transformed)

        # 3. Nothing configured -> send the flat field map.
        if not body and not mappings and not raw_template:
            body = dict(values)

        return body

    def build_headers(
        self, connector: Connector, values: dict[str, str]
    ) -> dict[str, str]:
        template = connector.request_template or {}
        headers: dict[str, str] = {}
        for k, v in (template.get("headers") or {}).items():
            headers[str(k)] = _interpolate(str(v), values)
        headers.setdefault("Content-Type", "application/json")
        return headers

    # ── auth ────────────────────────────────────────────────────────────────
    async def _attach_auth(
        self,
        connector: Connector,
        headers: dict[str, str],
        params: dict[str, str],
        db_persist: bool,
    ) -> None:
        auth_type = (connector.auth_type or "none").lower()
        cfg = self._auth_config(connector)
        if auth_type == "none" or not cfg:
            return

        if auth_type == "api_key":
            name = cfg.get("name") or cfg.get("header_name") or "X-API-Key"
            value = cfg.get("value") or cfg.get("key") or ""
            if (cfg.get("placement") or "header").lower() == "query":
                params[name] = value
            else:
                headers[name] = value
        elif auth_type == "bearer_token":
            token = cfg.get("token") or cfg.get("access_token") or ""
            headers["Authorization"] = f"Bearer {token}"
        elif auth_type == "basic":
            raw = f"{cfg.get('username', '')}:{cfg.get('password', '')}".encode()
            headers["Authorization"] = f"Basic {base64.b64encode(raw).decode()}"
        elif auth_type == "oauth2":
            token = await self._ensure_oauth_token(connector, cfg, db_persist)
            headers["Authorization"] = f"Bearer {token}"

    async def _ensure_oauth_token(
        self, connector: Connector, cfg: dict[str, Any], db_persist: bool
    ) -> str:
        token = cfg.get("access_token", "")
        expires_at = cfg.get("expires_at")
        now = time.time()

        def _expired() -> bool:
            if expires_at is None:
                return False
            try:
                return float(expires_at) <= now + 60
            except (TypeError, ValueError):
                return False

        refresh_token = cfg.get("refresh_token")
        token_url = cfg.get("token_url")
        if not (_expired() and refresh_token and token_url):
            return token

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    token_url,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                        "client_id": cfg.get("client_id", ""),
                        "client_secret": cfg.get("client_secret", ""),
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            new_token = data.get("access_token", token)
            cfg["access_token"] = new_token
            if data.get("refresh_token"):
                cfg["refresh_token"] = data["refresh_token"]
            if data.get("expires_in"):
                cfg["expires_at"] = now + float(data["expires_in"])
            if db_persist:
                await self._persist_auth_config(connector.id, cfg)
            return new_token
        except Exception:
            return token  # fall back to the existing (possibly stale) token

    async def _persist_auth_config(self, connector_id: str, cfg: dict[str, Any]) -> None:
        try:
            async with AsyncSessionLocal() as db:
                row = await db.get(Connector, connector_id)
                if row is not None:
                    row.auth_config_enc = encrypt_string(
                        json.dumps(cfg), settings.encryption_secret
                    )
                    await db.commit()
        except Exception:
            pass

    # ── request assembly ──────────────────────────────────────────────────────
    async def build_request(
        self, connector: Connector, fields: list[DocumentField], *, db_persist: bool
    ) -> dict[str, Any]:
        template = connector.request_template or {}
        values = _field_values(fields)

        method = str(template.get("method", "POST")).upper()
        path = template.get("path", "") or ""
        base = (connector.base_url or "").rstrip("/")
        url = f"{base}{path}" if path.startswith("/") else (f"{base}/{path}" if path else base)

        headers = self.build_headers(connector, values)
        params: dict[str, str] = {}
        await self._attach_auth(connector, headers, params, db_persist)
        body = self.build_body(connector, fields)

        return {"method": method, "url": url, "headers": headers, "params": params, "body": body}

    # ── public API ────────────────────────────────────────────────────────────
    async def execute(
        self, connector: Connector, document: Document | None, fields: list[DocumentField]
    ) -> dict[str, Any]:
        started = time.perf_counter()
        request = await self.build_request(connector, fields, db_persist=True)
        body = request["body"]
        is_json = isinstance(body, (dict, list))

        status_code: int | None = None
        response_text = ""
        success = False
        error_message: str | None = None

        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                    resp = await client.request(
                        request["method"],
                        request["url"],
                        headers=request["headers"],
                        params=request["params"] or None,
                        **({"json": body} if is_json else {"content": str(body)}),
                    )
                status_code = resp.status_code
                response_text = resp.text[:_BODY_TRUNCATE]
                if resp.status_code < 400:
                    success = True
                    break
                if resp.status_code < 500:
                    # 4xx are config errors — fail fast, don't retry.
                    error_message = f"Client error {resp.status_code}"
                    break
                error_message = f"Server error {resp.status_code}"
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_exc = exc
                error_message = f"{type(exc).__name__}: {exc}"
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                error_message = f"{type(exc).__name__}: {exc}"
                break  # non-retryable

            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_BACKOFF_BASE * (2**attempt))

        duration_ms = int((time.perf_counter() - started) * 1000)
        if not success and error_message is None and last_exc is not None:
            error_message = str(last_exc)

        request_summary = {
            "method": request["method"],
            "url": request["url"],
            "headers": _redact_headers(request["headers"]),
            "query": _redact_headers(request["params"]),
            "body": body if is_json else str(body)[:_BODY_TRUNCATE],
        }

        await self._write_log(
            connector_id=connector.id,
            document_id=document.id if document is not None else None,
            request_summary=request_summary,
            response_status=status_code,
            response_body=response_text,
            success=success,
            error_message=None if success else error_message,
            duration_ms=duration_ms,
        )

        return {
            "success": success,
            "status_code": status_code,
            "response_body": response_text,
            "error_message": None if success else error_message,
            "duration_ms": duration_ms,
        }

    async def test_connection(self, connector: Connector) -> dict[str, Any]:
        base = (connector.base_url or "").rstrip("/")
        if not base:
            return {
                "success": False,
                "status_code": None,
                "message": "No base URL configured.",
                "latency_ms": 0,
            }

        headers: dict[str, str] = {}
        params: dict[str, str] = {}
        try:
            await self._attach_auth(connector, headers, params, db_persist=False)
        except Exception:
            pass

        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.get(base, headers=headers, params=params or None)
            latency = int((time.perf_counter() - started) * 1000)
            ok = resp.status_code < 400
            return {
                "success": ok,
                "status_code": resp.status_code,
                "message": (
                    f"Reached endpoint ({resp.status_code})."
                    if ok
                    else f"Endpoint returned {resp.status_code}."
                ),
                "latency_ms": latency,
            }
        except Exception as exc:  # noqa: BLE001
            latency = int((time.perf_counter() - started) * 1000)
            return {
                "success": False,
                "status_code": None,
                "message": f"Connection failed: {exc}",
                "latency_ms": latency,
            }

    async def preview(
        self, connector: Connector, fields: list[DocumentField]
    ) -> dict[str, Any]:
        """Dry-run: build the full request without sending it (auth redacted)."""
        request = await self.build_request(connector, fields, db_persist=False)
        return {
            "method": request["method"],
            "url": request["url"],
            "headers": _redact_headers(request["headers"]),
            "query": _redact_headers(request["params"]),
            "body": request["body"],
        }

    async def _write_log(
        self,
        *,
        connector_id: str,
        document_id: str | None,
        request_summary: dict,
        response_status: int | None,
        response_body: str,
        success: bool,
        error_message: str | None,
        duration_ms: int,
    ) -> None:
        try:
            async with AsyncSessionLocal() as db:
                db.add(
                    ConnectorExecutionLog(
                        connector_id=connector_id,
                        document_id=document_id,
                        request_summary=request_summary,
                        response_status=response_status,
                        response_body_truncated=response_body or None,
                        success=success,
                        error_message=error_message,
                        duration_ms=duration_ms,
                    )
                )
                await db.commit()
        except Exception:
            pass


connector_engine = ConnectorEngine()

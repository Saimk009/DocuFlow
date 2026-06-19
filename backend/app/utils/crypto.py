"""Symmetric encryption helpers for secrets at rest (API keys, connector configs).

Uses Fernet (AES-128-CBC + HMAC). The provided ``key`` is a passphrase that is
normalized into a valid 32-byte url-safe base64 Fernet key, so callers can pass
an arbitrary-length secret (e.g. ``settings.SECRET_KEY``).
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


def _derive_fernet_key(key: str) -> bytes:
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_string(value: str, key: str) -> str:
    f = Fernet(_derive_fernet_key(key))
    token = f.encrypt(value.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_string(encrypted: str, key: str) -> str:
    f = Fernet(_derive_fernet_key(key))
    try:
        plain = f.decrypt(encrypted.encode("utf-8"))
    except InvalidToken as exc:  # pragma: no cover - defensive
        raise ValueError("Could not decrypt value: invalid token or key") from exc
    return plain.decode("utf-8")

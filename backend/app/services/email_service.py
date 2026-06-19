"""IMAP email ingestion.

Connects to a mailbox over IMAP, pulls unseen messages, and extracts
PDF/image attachments for document processing. ``imaplib`` is synchronous, so
callers running in an event loop should invoke these methods via
``asyncio.to_thread`` (see :mod:`app.workers.email_tasks`).
"""
from __future__ import annotations

import email
import imaplib
from dataclasses import dataclass, field
from email.header import decode_header, make_header
from email.message import Message

_ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "tif"}
_DEFAULT_IMAP_PORT = 993


@dataclass
class EmailAttachment:
    filename: str
    content: bytes
    content_type: str


@dataclass
class FetchedEmail:
    uid: str
    subject: str
    sender: str
    attachments: list[EmailAttachment] = field(default_factory=list)


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


class EmailIngestionService:
    """Stateful IMAP client scoped to a single mailbox connection."""

    def __init__(self, host: str, port: int, email: str, password: str) -> None:
        self.host = host
        self.port = port or _DEFAULT_IMAP_PORT
        self.email = email
        self.password = password
        self.conn: imaplib.IMAP4_SSL | None = None

    def connect_imap(
        self,
        host: str | None = None,
        port: int | None = None,
        email: str | None = None,
        password: str | None = None,
    ) -> imaplib.IMAP4_SSL:
        conn = imaplib.IMAP4_SSL(host or self.host, port or self.port)
        conn.login(email or self.email, password or self.password)
        conn.select("INBOX")
        self.conn = conn
        return conn

    def fetch_unseen_emails(self) -> list[FetchedEmail]:
        """Return unseen messages that carry at least one usable attachment.

        Uses ``BODY.PEEK`` so fetching does not implicitly mark messages as
        read; callers explicitly :meth:`mark_seen` after successful ingestion.
        """
        if self.conn is None:
            self.connect_imap()
        assert self.conn is not None

        typ, data = self.conn.search(None, "UNSEEN")
        if typ != "OK" or not data or not data[0]:
            return []

        out: list[FetchedEmail] = []
        for uid in data[0].split():
            uid_str = uid.decode() if isinstance(uid, bytes) else str(uid)
            typ, msg_data = self.conn.fetch(uid, "(BODY.PEEK[])")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0][1]
            if not isinstance(raw, (bytes, bytearray)):
                continue
            msg = email.message_from_bytes(raw)
            attachments = self.extract_attachments(msg)
            if not attachments:
                continue
            out.append(
                FetchedEmail(
                    uid=uid_str,
                    subject=_decode(msg.get("Subject")),
                    sender=_decode(msg.get("From")),
                    attachments=attachments,
                )
            )
        return out

    def extract_attachments(self, email_msg: Message) -> list[EmailAttachment]:
        attachments: list[EmailAttachment] = []
        for part in email_msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            disposition = (part.get("Content-Disposition") or "").lower()
            filename = _decode(part.get_filename())
            if not filename or "attachment" not in disposition:
                continue
            if _ext(filename) not in _ALLOWED_EXTENSIONS:
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            attachments.append(
                EmailAttachment(
                    filename=filename,
                    content=payload,
                    content_type=part.get_content_type() or "application/octet-stream",
                )
            )
        return attachments

    def mark_seen(self, uid: str) -> None:
        if self.conn is None:
            return
        self.conn.store(uid, "+FLAGS", "\\Seen")

    def logout(self) -> None:
        if self.conn is None:
            return
        try:
            self.conn.close()
        except Exception:
            pass
        try:
            self.conn.logout()
        except Exception:
            pass
        self.conn = None

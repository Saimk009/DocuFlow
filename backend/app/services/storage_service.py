"""Object storage backed by MinIO (S3-compatible).

The MinIO SDK is synchronous, so blocking calls are off-loaded to a worker
thread via ``asyncio.to_thread`` to keep the event loop responsive.
"""
from __future__ import annotations

import asyncio
import io
import uuid
from datetime import datetime, timedelta

from minio import Minio
from minio.error import S3Error

from app.config import settings


class StorageService:
    def __init__(self) -> None:
        # Honor an explicit MINIO_SECURE flag; otherwise auto-detect (local
        # endpoints stay plaintext, remote endpoints default to TLS).
        is_local = settings.MINIO_ENDPOINT.startswith(("localhost", "127.0.0.1"))
        secure = settings.MINIO_SECURE or not is_local
        self._client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=secure,
        )
        self._bucket = settings.MINIO_BUCKET

    def _ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    @staticmethod
    def _build_object_name(tenant_id: str, filename: str) -> str:
        now = datetime.utcnow()
        safe_name = filename.replace("/", "_").replace("\\", "_").strip() or "file"
        return f"{tenant_id}/{now.year}/{now.month:02d}/{uuid.uuid4().hex}_{safe_name}"

    async def upload_file(
        self,
        tenant_id: str,
        file_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> str:
        object_name = self._build_object_name(str(tenant_id), filename)

        def _put() -> str:
            self._ensure_bucket()
            self._client.put_object(
                self._bucket,
                object_name,
                data=io.BytesIO(file_bytes),
                length=len(file_bytes),
                content_type=content_type or "application/octet-stream",
            )
            return object_name

        return await asyncio.to_thread(_put)

    async def get_file_url(self, storage_path: str, expires: int = 3600) -> str:
        def _presign() -> str:
            return self._client.presigned_get_object(
                self._bucket, storage_path, expires=timedelta(seconds=expires)
            )

        return await asyncio.to_thread(_presign)

    async def download_file(self, storage_path: str) -> bytes:
        def _get() -> bytes:
            response = self._client.get_object(self._bucket, storage_path)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()

        return await asyncio.to_thread(_get)

    async def delete_file(self, storage_path: str) -> None:
        def _remove() -> None:
            try:
                self._client.remove_object(self._bucket, storage_path)
            except S3Error:
                # Already gone / never existed -> idempotent delete.
                pass

        await asyncio.to_thread(_remove)


storage_service = StorageService()

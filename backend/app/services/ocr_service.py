"""OCR via Tesseract. PDFs are rasterized with pdf2image (poppler) first.

System requirements at runtime: the ``tesseract`` binary and ``poppler`` utils
must be installed on the host/container.
"""
from __future__ import annotations

import asyncio
import io

import pytesseract
from PIL import Image

_PDF_TYPES = {"pdf", "application/pdf"}
_IMAGE_TYPES = {
    "png",
    "jpg",
    "jpeg",
    "tif",
    "tiff",
    "image/png",
    "image/jpeg",
    "image/tiff",
}


def _normalize(file_type: str) -> str:
    return (file_type or "").lower().strip().lstrip(".")


class OCRService:
    async def extract_text(self, file_bytes: bytes, file_type: str) -> str:
        ft = _normalize(file_type)

        def _run() -> str:
            if ft in _PDF_TYPES or ft.endswith("pdf"):
                return self._ocr_pdf(file_bytes)
            if ft in _IMAGE_TYPES or ft.split("/")[-1] in _IMAGE_TYPES:
                text = pytesseract.image_to_string(Image.open(io.BytesIO(file_bytes)))
                return f"--- PAGE 1 ---\n{text.strip()}\n"
            raise ValueError(f"Unsupported file type for OCR: {file_type}")

        return await asyncio.to_thread(_run)

    @staticmethod
    def _ocr_pdf(file_bytes: bytes) -> str:
        from pdf2image import convert_from_bytes

        pages = convert_from_bytes(file_bytes)
        chunks: list[str] = []
        for idx, page in enumerate(pages, start=1):
            text = pytesseract.image_to_string(page).strip()
            chunks.append(f"--- PAGE {idx} ---\n{text}\n")
        return "".join(chunks)

    async def get_page_count(self, file_bytes: bytes, file_type: str) -> int:
        ft = _normalize(file_type)

        def _count() -> int:
            if ft in _PDF_TYPES or ft.endswith("pdf"):
                from pdf2image import pdfinfo_from_bytes

                info = pdfinfo_from_bytes(file_bytes)
                return int(info.get("Pages", 1))
            # Multi-frame images (e.g. TIFF) may have multiple pages.
            try:
                img = Image.open(io.BytesIO(file_bytes))
                return getattr(img, "n_frames", 1)
            except Exception:
                return 1

        return await asyncio.to_thread(_count)


ocr_service = OCRService()

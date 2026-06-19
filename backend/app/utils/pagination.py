"""Offset pagination helper for async SQLAlchemy 2.0 queries."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class PaginationParams:
    page: int = 1
    page_size: int = 20

    def __post_init__(self) -> None:
        if self.page < 1:
            self.page = 1
        if self.page_size < 1:
            self.page_size = 1
        if self.page_size > 100:
            self.page_size = 100

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


async def paginate(
    db: AsyncSession, query: Select, params: PaginationParams
) -> dict[str, Any]:
    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = (await db.execute(count_query)).scalar_one()

    result = await db.execute(query.limit(params.page_size).offset(params.offset))
    items = list(result.scalars().all())

    pages = (total + params.page_size - 1) // params.page_size if total else 0

    return {
        "items": items,
        "total": total,
        "page": params.page,
        "pages": pages,
    }

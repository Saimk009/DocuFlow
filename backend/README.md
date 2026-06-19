# DocuFlow Backend

FastAPI + async SQLAlchemy 2.0 backend for the DocuFlow IDP platform.

## Stack
Python 3.11, FastAPI, SQLAlchemy 2.0 (async/asyncpg), Alembic, PostgreSQL, Redis, Celery, Pydantic v2.

## Setup
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then edit values
```

## Database
```bash
alembic upgrade head        # apply migrations
alembic revision --autogenerate -m "message"   # create a new migration
```

## Run
```bash
./run.sh                    # uvicorn app.main:app --reload :8000
```

Health check: `GET /health`

## Layout
- `app/config.py` — pydantic-settings, reads `.env`
- `app/database.py` — async engine, `AsyncSession`, `Base`, `get_db`
- `app/models/` — ORM models (UUID PKs, `lazy="selectin"` relationships)
- `alembic/` — migrations (`0001_initial` creates the full schema)

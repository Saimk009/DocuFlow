# DocuFlow — Enterprise Intelligent Document Processing

**DocuFlow turns unstructured documents into validated, structured data — and gets a brand-new tenant from signup to a live, working pipeline in under 10 minutes.**

It is a multi-tenant **Intelligent Document Processing (IDP)** platform that combines OCR, AI-powered classification and extraction, a visual workflow designer, RPA robots, root-cause exception management, and a fully configurable connector engine into a single command center. Every organization gets an isolated workspace at its own subdomain, with real-time processing updates streamed over WebSockets.

---

## 🎯 Why DocuFlow (and why it beats legacy IDP)

Legacy IDP suites (Kofax / Tungsten, ABBYY, OpenText) are powerful but consistently criticized for three things: **multi-week implementations that need certified specialists, painful exception handling, and a thin, rigid connector ecosystem.** DocuFlow was designed specifically to fix all three.

| Pain point with legacy IDP | DocuFlow's answer |
| --- | --- |
| **Weeks-long, specialist-led implementations** | A guided **Setup Wizard** picks an industry template, connects an AI engine, runs a live demo extraction, and invites the team — a working pipeline in **under 10 minutes**, no consultants required. |
| **Exception queues are flat lists of hundreds of failed docs** | The **Exception Resolution Center** clusters failures by *root cause* — "4 root causes affecting 40 documents" — so one fix resolves many at once, with AI-suggested remediations. |
| **Every integration needs a bespoke, vendor-built connector** | A **generic, configurable connector engine** lets a tenant wire DocuFlow to almost any REST system (auth, field mapping, transforms, triggers) themselves, with a live payload preview — no waiting for a native Salesforce/SAP connector. |
| **Opaque, on-prem, hard to operate** | Cloud-native, container-first, horizontally scalable, with **per-tenant isolation**, encrypted secrets, and live observability. |
| **Black-box AI** | Bring-your-own **Claude or OpenAI** key per tenant, switchable at any time, with confidence scores surfaced on every extracted field. |

**The differentiators in one line:** *fast self-serve onboarding, exception management that thinks in root causes, and an integration layer you configure instead of wait for.*

---

## ✨ Features

- 📥 **Multi-channel capture** — drag-and-drop upload, batch processing, and automatic email-inbox ingestion
- 🔍 **OCR + AI extraction** — Tesseract OCR with Claude / GPT-4o classification and field extraction, confidence-scored
- 🧩 **Visual workflow designer** — drag-and-drop pipelines built on a node graph
- 🤖 **RPA robots** — manual, scheduled (cron), and event-triggered automations
- 🚦 **Exception Resolution Center** — root-cause clustering of failed/low-confidence documents with bulk, one-click remediation
- 🔧 **Configurable connector engine** — build REST integrations visually: auth (API key / Bearer / Basic / OAuth 2.0), field mapping with transforms, trigger rules, and a live "exactly what will be sent" payload preview
- 🚀 **10-minute onboarding wizard** — industry templates, AI engine setup, live demo extraction, and team invites
- 📊 **Analytics** — volume, accuracy, exception, and SLA dashboards
- 🗂️ **Case management** — table + kanban views for complex, multi-document processes
- 🔌 **Webhooks** — HMAC-SHA256 signed outbound events with execution logs
- 🏢 **Multi-tenancy** — subdomain-isolated orgs with a super-admin control panel
- ⚡ **Real-time** — live pipeline + queue updates via WebSockets
- 🔐 **Secure by default** — JWT auth and Fernet-encrypted secrets at rest

---

## 🏗️ Architecture

```
                    ┌──────────────────────────┐
                    │   Frontend (React/Vite)   │
                    │   yourslug.docuflow.com   │
                    └────────────┬──────────────┘
                                 │ HTTPS / WSS
                    ┌────────────▼──────────────┐
                    │     FastAPI backend        │
                    │  REST + WebSocket + Auth   │
                    └──┬─────────┬─────────┬─────┘
                       │         │         │
          ┌────────────▼──┐ ┌────▼────┐ ┌──▼─────────┐
          │  PostgreSQL   │ │  Redis  │ │   MinIO    │
          │ (tenant data) │ │ broker/ │ │  (files)   │
          │               │ │ pubsub  │ │            │
          └───────────────┘ └────┬────┘ └────────────┘
                                  │
                   ┌──────────────▼───────────────┐
                   │   Celery workers + beat       │
                   │  OCR · AI · robots · email     │
                   │  · connectors · clustering     │
                   └───────────────────────────────┘
```

**Stack:** FastAPI · SQLAlchemy 2.0 (async) · Alembic · PostgreSQL · Redis · Celery · MinIO · React 18 · Vite · TypeScript · TanStack Query · Tailwind CSS · Framer Motion.

---

## 🚀 Quick Start

> Requires [Docker](https://docs.docker.com/get-docker/) + Docker Compose.

```bash
# 1. Configure the backend environment
cp backend/.env.example backend/.env
# edit backend/.env — set SECRET_KEY and ENCRYPTION_KEY (see below)

# 2. Build & start the whole stack
docker compose up --build
```

| Service     | URL                          | Notes                          |
| ----------- | ---------------------------- | ------------------------------ |
| Frontend    | http://localhost:5173        | Web client                     |
| API + docs  | http://localhost:8000/docs   | FastAPI interactive docs       |
| MinIO API   | http://localhost:9000        | S3-compatible object storage   |
| MinIO UI    | http://localhost:9001        | `minioadmin` / `minioadmin`    |

After the containers are healthy, initialize the database (one-time):

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -c "from app.workers.celery_app import celery_app; print('Celery OK')"
```

### Running without Docker

Each piece can run natively if you have PostgreSQL, Redis, and MinIO available:

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload

# Celery (separate terminals)
celery -A app.workers.celery_app:celery_app worker --loglevel=info
celery -A app.workers.celery_app:celery_app beat --loglevel=info

# Frontend
cd frontend
npm install
npm run dev
```

> Note: OCR requires the `tesseract` binary and PDF rendering requires `poppler` on the host.

---

## 🏭 Production Deployment

DocuFlow is container-first and horizontally scalable. A typical production topology:

- **Frontend** — build static assets (`npm run build`) and serve via a CDN or `nginx`; point it at the API/WSS origin.
- **API** — run `uvicorn`/`gunicorn` behind a TLS-terminating reverse proxy (nginx, Traefik, or a managed LB). Scale stateless API pods horizontally.
- **Workers** — scale Celery workers independently from the API to absorb OCR/AI bursts; run a single `beat` scheduler for periodic jobs.
- **Datastores** — managed **PostgreSQL** (primary + replicas), managed **Redis** (broker, cache, pub/sub, JWT blacklist), and **S3-compatible** object storage (MinIO or AWS S3) for documents.

### Production checklist

- [ ] Set `DEBUG=false` and a strict `FRONTEND_URL` to lock CORS to your domain.
- [ ] Generate strong, unique `SECRET_KEY` and `ENCRYPTION_KEY` (never reuse across environments).
- [ ] Serve everything over **HTTPS/WSS**; enable HSTS at the proxy.
- [ ] Use managed Postgres/Redis with backups, TLS, and auth.
- [ ] Configure wildcard DNS + TLS (`*.docuflow.com`) for subdomain-based tenancy.
- [ ] Run `alembic upgrade head` on deploy; keep migrations forward-only.
- [ ] Set per-tenant AI keys via the app (encrypted at rest) — never bake provider keys into images.
- [ ] Monitor Celery queue depth and API latency; alert on rising exception-cluster counts.

---

## ⚙️ Environment Variables

| Variable                      | Description                                              | Example                                                       |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                | Async PostgreSQL connection string                       | `postgresql+asyncpg://docuflow:secret@localhost:5432/docuflow` |
| `REDIS_URL`                   | Redis broker/backend + pub-sub                           | `redis://localhost:6379/0`                                    |
| `SECRET_KEY`                  | JWT signing key (use a long random string)               | `your-256-bit-secret-key-here`                                |
| `ALGORITHM`                   | JWT algorithm                                            | `HS256`                                                       |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime                                    | `60`                                                          |
| `ENCRYPTION_KEY`              | Fernet key for secrets at rest (blank → reuses SECRET_KEY) | `…` (see below)                                              |
| `MINIO_ENDPOINT`              | MinIO host:port                                          | `localhost:9000`                                              |
| `MINIO_ACCESS_KEY`            | MinIO access key                                        | `minioadmin`                                                  |
| `MINIO_SECRET_KEY`            | MinIO secret key                                        | `minioadmin`                                                  |
| `MINIO_BUCKET`                | Bucket for document storage                             | `docuflow`                                                    |
| `MINIO_SECURE`                | Use TLS for MinIO                                       | `false`                                                       |
| `SUPER_ADMIN_EMAIL`           | Email granted super-admin access                        | `admin@docuflow.com`                                          |
| `FRONTEND_URL`                | Public client URL (locks CORS when `DEBUG=false`)        | `http://localhost:5173`                                       |
| `DEBUG`                       | Open CORS + verbose mode                                | `true`                                                        |

Generate an `ENCRYPTION_KEY`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 🏢 Multi-Tenancy

DocuFlow isolates every organization by subdomain:

1. **Create an org** at `docuflow.com/register` — pick an organization name and a URL slug, then the **Setup Wizard** walks you to a live pipeline.
2. **Access it** at `yourslug.docuflow.com` — all API calls carry the tenant context (subdomain in production, or the `X-Tenant-Slug` header in local development).
3. **Super admins** (`SUPER_ADMIN_EMAIL`) can manage all tenants from the admin panel at `/admin`.

---

## 🔧 Configurable Connectors

Instead of hardcoded, vendor-built integrations, DocuFlow ships a generic REST connector engine you configure in a visual builder:

- **Connection** — base URL, method/path, headers, and a JSON body template with `{{field_key}}` placeholders. Auth: None, API Key (header/query), Bearer, Basic, or OAuth 2.0.
- **Field Mapping** — map extracted DocuFlow fields to dot-notation target paths with transforms (uppercase, ISO date, currency cents), and **preview the exact payload** against a real sample document before saving.
- **Trigger Rules** — fire on document completion/exception, batch completion, or case updates, optionally filtered by doc type.
- **Reliability** — failed requests retry with exponential backoff; persistent failures are logged and grouped in the Exception Resolution Center. Every execution is recorded with request/response detail and a per-connector success rate.

---

## 📚 API Documentation

Interactive, auto-generated API docs are available while the backend is running:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 🤖 AI Provider Setup

DocuFlow supports both Anthropic Claude and OpenAI for classification/extraction. Configure your provider per-tenant in **Settings → AI Provider** (keys are encrypted at rest):

- **Claude (Anthropic):** create a key at [console.anthropic.com](https://console.anthropic.com/), select provider **Claude**, and paste the key.
- **OpenAI (GPT-4o):** create a key at [platform.openai.com](https://platform.openai.com/api-keys), select provider **OpenAI**, and paste the key.

The provider in use is shown in the top bar and can be switched at any time.

---

## 🤝 Contributing

1. Fork the repo and create a feature branch: `git checkout -b feature/my-change`
2. Make your changes with clear, focused commits.
3. Ensure the backend imports cleanly and the frontend builds (`npm run build`).
4. Open a pull request describing the change and the motivation.

## 📄 License

MIT

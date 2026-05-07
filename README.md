# Proposal Agent

> AI-powered consulting proposal generation platform — internal tool for KPMG Saudi Arabia Advisory.

From an RFP to a submission-ready KPMG-branded technical + commercial proposal in days, not weeks. Includes a configurable knowledge base, dynamic template builder, RFP intelligence, local-LLM-first generation (data sovereignty), collaboration/review workflow, and ZATCA/PDPL-aware commercial engine.

**Base path:** `/ProposalAgent`
**Stack:** React 18 + TypeScript · Python 3.11 + FastAPI · PostgreSQL 16 (pgvector) · Ollama · Nginx · Docker

---

## Repository structure

```
proposal-agent/
├── docker-compose.yml          (dev)
├── docker-compose.prod.yml     (prod overlay)
├── .env.example
├── nginx/          (reverse proxy + TLS)
├── backend/        (FastAPI + SQLAlchemy + Alembic)
├── frontend/       (React + Vite + Tailwind, KPMG theme)
├── db/migrations/  (forward-only versioned SQL)
├── ollama/         (LLM runtime, preloads Qwen2.5 + nomic-embed-text)
├── scripts/        (deploy, backup, migrations, bootstrap)
└── docs/
    └── PRD.docx    (full product requirements, 13 phases)
```

Full details — feature spec, phased plan, data model, acceptance criteria — are in `docs/PRD.docx`.

---

## Quick start (development)

**Prerequisites:** Docker 24+, Docker Compose v2, 16 GB RAM minimum (32 GB+ recommended for running local LLMs).

```bash
# 1. Clone and enter
git clone <your-repo-url> proposal-agent && cd proposal-agent

# 2. Configure environment
cp .env.example .env
# Then edit .env — at minimum set:
#   JWT_SECRET_KEY (generate: openssl rand -hex 64)
#   POSTGRES_PASSWORD
#   FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD

# 3. Launch the stack
docker compose up -d --build

# 4. Wait for migrations to complete (first run pulls LLM models, ~5-15 min)
docker compose logs -f migrations ollama

# 5. Bootstrap the first admin
./scripts/init-first-admin.sh

# 6. Open the app
open http://localhost/ProposalAgent
```

The API is reachable at `http://localhost/ProposalAgent/api/v1` (through Nginx) or `http://localhost:8000/ProposalAgent/api/v1` (direct, dev only). API docs at `/ProposalAgent/api/docs` (disabled in production).

---

## Services

| Service         | Container name    | Purpose                                       | Port (dev) |
|-----------------|-------------------|-----------------------------------------------|------------|
| `nginx`         | `pa_nginx`        | TLS termination, reverse proxy, static assets | 80, 443    |
| `backend`       | `pa_backend`      | FastAPI application                           | 8000       |
| `worker`        | `pa_worker`       | Celery worker for long-running tasks          | —          |
| `frontend_build`| `pa_frontend_build` | Builds React into shared volume             | —          |
| `db`            | `pa_db`           | PostgreSQL 16 + pgvector                      | 5432       |
| `redis`         | `pa_redis`        | Celery broker + cache                         | —          |
| `ollama`        | `pa_ollama`       | Local LLM runtime                             | 11434      |
| `migrations`    | `pa_migrations`   | One-shot migration runner                     | —          |

---

## Database migrations

Forward-only versioned SQL under `db/migrations/`.

- Each feature that touches schema adds a new `V<NNN>__<snake_case>.sql`.
- Migrations run automatically on `docker compose up` via the `migrations` service.
- To re-run manually: `docker compose run --rm migrations`
- Applied versions are tracked in the `migrations_history` table.
- To reverse something, write a new migration that reverses it — never edit applied files.

---

## Running tests

**Backend (pytest):**
```bash
docker compose exec backend pytest -v
docker compose exec backend pytest --cov=app --cov-report=term-missing
```

**Frontend (Vitest):**
```bash
docker compose exec frontend_build npm test
```

---

## Production deployment (cloud VM)

**Recommended VM spec (Azure KSA region):**
- 16 vCPU, 128 GB RAM minimum (192 GB if running 32B-parameter LLMs locally)
- NVIDIA A10/A100 GPU (or rely on CPU inference for smaller models)
- 1 TB NVMe primary + 2 TB secondary for models/exports
- Private endpoint; public ingress via Azure Application Gateway + WAF

**Deploy workflow:**
```bash
# On the VM, in the repo directory:
cp .env.example .env            # and fill real production values
./scripts/deploy.sh             # pulls latest, builds, migrates, restarts, smoke-tests
./scripts/init-first-admin.sh   # one-time, first deploy only
```

**TLS certificates:** place Let's Encrypt or KPMG-issued certs under `/etc/letsencrypt/live/<domain>/` before starting `nginx` with the prod overlay.

**Backups:** `scripts/backup.sh` runs nightly via cron, encrypted DB dump + exports volume, 30-day retention.

---

## Delivery plan

The platform is delivered in **13 phases over 32 weeks**. Phase gates require all unit tests green, migration clean, and UAT sign-off. See `docs/PRD.docx` §9 for full per-phase detail.

| # | Phase                                   | Weeks  |
|---|-----------------------------------------|--------|
| 1 | Foundation, Auth, Project Skeleton      | 1–3    |
| 2 | User Management & Admin Settings        | 4–5    |
| 3 | Knowledge Base Module                   | 6–9    |
| 4 | Dynamic Template Builder                | 10–11  |
| 5 | LLM Integration (Ollama + RAG)          | 12–13  |
| 6 | RFP / RFI Intelligence                  | 14–16  |
| 7 | Proposal Generation Engine              | 17–20  |
| 8 | Collaboration & Workflow                | 21–23  |
| 9 | Commercial Engine                       | 24–26  |
| 10| Team & Credentials Library              | 27     |
| 11| Analytics & Win/Loss                    | 28     |
| 12| Saudi-Specific & Brand Compliance       | 29–30  |
| 13| Integrations & Hardening                | 31–32  |

Current scaffold delivers Phase 1.

---

## Key architectural decisions

- **Data sovereignty first.** All storage, compute, and LLM inference run in KSA region. Proposals with `Restricted` classification cannot be routed to cloud LLMs — enforced at the API layer.
- **Single Nginx origin.** The frontend and API are served from `/ProposalAgent/*` on the same host, eliminating CORS surface area in production.
- **Forward-only migrations.** Schema changes via versioned SQL. Alembic used in dev for autogen; hand-reviewed SQL committed.
- **Append-only audit log.** Database triggers prevent UPDATE/DELETE on `audit_events`.
- **Confirmation modals everywhere.** A single `ConfirmDialog` component is used for every destructive action across the app — always names the affected object.
- **Validation at both layers.** `zod` schemas on the frontend mirror the backend's Pydantic models and password policy.

---

## Contributing

- PRs run the full CI gate: `pytest`, `vitest`, linters, migration smoke test, docker build.
- Never commit `.env`, secrets, or client-confidential content.
- Every schema change ships with a migration and unit tests.

---

## License

Internal KPMG asset. Confidential — not for redistribution.

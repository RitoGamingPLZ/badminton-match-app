# Badminton Match App

A real-time badminton match scheduler for friend groups. Create a room, share the 4-digit code, everyone joins on their own phone, and the app handles the rest — fair match generation, live updates, result tracking, undo, and edit.

## Monorepo structure

```
badminton-match-app/
├── frontend/               Vue 3 + Vite + Tailwind CSS v4 SPA
├── backend/                Node.js REST + SSE API (Express)
├── infra/                  Terraform — GCP frontend hosting (GCS)
├── .github/workflows/      CI (build + terraform validate) + deploy (GCS sync)
├── docker-compose.yml      Full local stack (frontend + backend + MongoDB)
└── package.json            npm workspace root
```

See [`frontend/README.md`](frontend/README.md) and [`backend/README.md`](backend/README.md) for stack details, API reference, and configuration.

---

## Local development

### With Docker (recommended)

```bash
git clone https://github.com/RitoGamingPLZ/badminton-match-app.git
cd badminton-match-app
docker compose up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| MongoDB | localhost:27017 |

Source files are bind-mounted so hot-module replacement works without rebuilding the image.

#### In-memory (no database)

```bash
DB_DRIVER=memory docker compose up backend
```

State lives in process memory and resets on restart — useful for quick experiments.

### Without Docker

```bash
npm install          # installs all workspaces

# Backend — pick a driver:
DB_DRIVER=memory npm run dev --workspace=backend    # no DB needed
DB_DRIVER=mongodb npm run dev --workspace=backend   # local MongoDB on 27017

# Frontend (separate terminal)
npm run dev --workspace=frontend
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` → `http://localhost:3001`.

---

## Hosting

Frontend is hosted as a static site on Google Cloud Storage. Backend can run on Cloud Run, any VPS, or any platform that supports Node.js + MongoDB.

Infrastructure for the GCS bucket is managed with Terraform in `infra/`. CI/CD is handled by GitHub Actions.

### First-time setup

1. **Bootstrap remote state** (optional) — create a GCS bucket manually, then uncomment the `backend "gcs"` block in `infra/main.tf`.

2. **Add GitHub Actions secrets:**

| Secret | Description |
|---|---|
| `GCP_PROJECT` | GCP project ID |
| `GCP_SA_KEY` | Service Account JSON key (Storage Admin role) |
| `GCS_BUCKET_NAME` | GCS bucket name (must be globally unique) |
| `VITE_API_BASE` | Backend API URL for the frontend build |

3. **Push to `main`** — the deploy workflow runs automatically:
   - Builds the frontend (Vite)
   - Runs `terraform apply` (creates/updates the GCS bucket)
   - Syncs the frontend build to GCS via `gsutil`

### Backend deployment

The backend is a standard Express app deployable anywhere Node.js runs:

- **Cloud Run** — `docker build` + `gcloud run deploy`; set `MONGO_URI` pointing at MongoDB Atlas
- **Docker/VPS** — `docker compose up` or `node src/server.js` with appropriate env vars
- **Any PaaS** — set `PORT`, `DB_DRIVER=mongodb`, and `MONGO_URI`

### CI pipeline (on every PR)

- Frontend: `vite build`
- Backend: Node.js syntax check
- Terraform: `terraform validate` + `terraform fmt -check -recursive`

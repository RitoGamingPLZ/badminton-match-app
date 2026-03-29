# Badminton Match App

A real-time badminton match scheduler for friend groups. Create a room, share the 4-digit code, everyone joins on their own phone, and the app handles the rest — fair match generation, live updates, result tracking, undo, and edit.

## Monorepo structure

```
badminton-match-app/
├── frontend/               Vue 3 + Vite + Tailwind CSS v4 SPA
│   ├── src/
│   │   ├── views/          HomeView, LobbyView, SessionView, EditMatchesView
│   │   ├── store/room.js   Pinia store — full app state + API actions
│   │   ├── api.js          REST + SSE client
│   │   └── style.css       Tailwind import + shared transitions
│   ├── Dockerfile          Local dev container (vite dev)
│   └── README.md
│
├── backend/                Node.js REST + SSE API (Express)
│   ├── src/
│   │   ├── app.js          Express app (local dev + Cloud Run / any Node host)
│   │   ├── server.js       Local HTTP server entry point
│   │   ├── config.js       Shared constants (CORS headers, limits)
│   │   ├── errors.js       Centralised error message constants
│   │   ├── roomUtils.js    Room serialisation + undo/log stack helpers
│   │   ├── matchGen.js     Fair match generation (MinHeap, O(log n))
│   │   ├── commands/       Command pattern — MatchDone, Skip, EditMatch
│   │   ├── routes/         Express route handlers + SSE
│   │   ├── validation/     Input + room-state validators
│   │   └── db/
│   │       ├── index.js              Repository factory (DB_DRIVER env var)
│   │       ├── transaction.js        withRetry / withTransaction helpers
│   │       ├── MongoRepository.js    MongoDB (default; docker-compose / Cloud Run)
│   │       └── InMemoryRepository.js Map-backed (tests / zero-dep local)
│   ├── Dockerfile          Local dev container (node server.js)
│   └── README.md
│
├── infra/                  Terraform — GCP frontend hosting (GCS)
│   ├── main.tf             GCP provider + remote state config
│   ├── storage.tf          GCS bucket — public static website hosting
│   ├── variables.tf
│   └── outputs.tf
│
├── .github/workflows/
│   ├── ci.yml              Build + terraform validate/fmt on PRs
│   └── deploy.yml          Build → terraform apply (GCS) → gsutil sync on merge to main
│
├── docker-compose.yml      Full local stack (frontend + backend + MongoDB)
└── package.json            npm workspace root
```

---

## Features

| Feature | Details |
|---|---|
| **Create & join** | Host creates a room with a 4-digit code; players join on their own phones |
| **Doubles** | Format is doubles (2v2); generates a full fair schedule |
| **Fair scheduling** | MinHeap-based O(log n) selection — players with fewest games go first; team splits minimise repeated pairings |
| **Skip match** | Skip the active match without awarding points |
| **Undo** | Undo the last operation (capped at 10 levels) |
| **Edit any match** | Host can change teams on any pending match; edited matches are pinned and survive schedule regeneration |
| **Operation history** | Full log of match results, skips and edits (last 50) |
| **Live updates** | SSE (Server-Sent Events) — every client auto-syncs on every version change |
| **Optimistic locking** | All writes carry a `version`; conflicts return HTTP 409 |
| **Auto-expiry** | Rooms expire after 24 hours (MongoDB TTL index / in-memory lazy eviction) |
| **DB-agnostic backend** | Swap between MongoDB and in-memory via `DB_DRIVER` env var |

---

## Local development

The fastest way to run the full stack locally is Docker Compose.

### With Docker (recommended)

```bash
# Clone and start everything — frontend + backend + MongoDB
git clone https://github.com/RitoGamingPLZ/badminton-match-app.git
cd badminton-match-app
docker compose up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| MongoDB | localhost:27017 |

Source files are bind-mounted into the frontend container so hot-module replacement works without rebuilding the image.

#### In-memory (no database)

```bash
DB_DRIVER=memory docker compose up backend
```

State lives in process memory and resets on restart — useful for quick experiments.

---

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

## Deployment (GCP — frontend via GCS)

Frontend is hosted on Google Cloud Storage. Backend can run on Cloud Run, any VPS, or any platform that supports Node.js + MongoDB.

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

### CI pipeline (on every PR)

- Frontend: `vite build`
- Backend: Node.js syntax check
- Terraform: `terraform validate` + `terraform fmt -check -recursive`

---

## Architecture

### Request flow

```
Browser  →  POST /rooms/1234/match/done  →  Node.js Express server
                                         →  DB write (version: 5 → 6)
Browser  ←  SSE: room state v6           ←  SSE handler polls DB every 2s
```

### Real-time (SSE)

- Each client opens an `EventSource` to `GET /rooms/:code/events`
- The SSE handler polls the database every 2 seconds and streams a `data:` event whenever the room `version` increases
- If a tab is backgrounded and SSE drops, a `GET /rooms/:code` on re-focus catches up

### Command pattern

All state-mutating operations are Command objects in `backend/src/commands/`:

```
command.execute(room) → { patch, logEntry }
```

A central `runCommand()` in `routes/helpers.js` handles undo-snapshot and operation-log bookkeeping for every command uniformly. Undo restores a full state snapshot (not re-execution).

### Database abstraction

`DB_DRIVER` env var selects the driver at startup:

| Driver | Class | Use case |
|---|---|---|
| `mongodb` _(default)_ | `MongoRepository` | Docker Compose / Cloud Run / self-hosted |
| `memory` | `InMemoryRepository` | Tests / zero-dependency local |

All drivers implement the same interface and normalise version-conflict errors to `VersionConflictError`.

### Match generation fairness

- **MinHeap** keeps players sorted by `gamesPlayed` in O(log n)
- **Doubles:** picks 4 lowest-count players, evaluates all 3 possible 2v2 splits, chooses the split with fewest repeated partner pairings
- **Pinned matches** survive regeneration — `regenerateUnpinnedMatches()` preserves manually edited matches in-place and inflates virtual gamesPlayed for players locked into pinned slots

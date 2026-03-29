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
├── backend/                Node.js REST + SSE API
│   ├── src/
│   │   ├── handler.js      Lambda entry point — REST + SSE streaming
│   │   ├── app.js          Express app — local dev (reuses Lambda route handlers)
│   │   ├── server.js       Local HTTP server (wraps app.js)
│   │   ├── config.js       Shared constants (CORS headers, limits)
│   │   ├── errors.js       Centralised error message constants
│   │   ├── roomUtils.js    Room serialisation + undo/log stack helpers
│   │   ├── matchGen.js     Fair match generation (MinHeap, O(log n))
│   │   ├── commands/       Command pattern — MatchDone, Skip, EditMatch
│   │   ├── routes/         Lambda route handlers (shared with local Express)
│   │   ├── validation/     Input + room-state validators
│   │   └── db/
│   │       ├── index.js            Repository factory (DB_DRIVER env var)
│   │       ├── transaction.js      withRetry / withTransaction helpers
│   │       ├── DynamoRepository.js AWS DynamoDB (production / Lambda)
│   │       ├── MongoRepository.js  MongoDB (docker-compose / self-hosted)
│   │       └── InMemoryRepository.js Map-backed (tests / zero-dep local)
│   ├── Dockerfile          Local dev container (node server.js)
│   └── README.md
│
├── infra/                  Terraform — AWS Lambda + DynamoDB + S3
│   ├── main.tf             Provider + remote state (S3 backend)
│   ├── lambda.tf           Lambda arm64, IAM, Function URL (RESPONSE_STREAM)
│   ├── dynamodb.tf         BadmintonRooms table, PAY_PER_REQUEST, TTL
│   ├── s3.tf               Frontend static hosting bucket + CORS
│   ├── variables.tf
│   └── outputs.tf
│
├── .github/workflows/
│   ├── ci.yml              Build + terraform validate/fmt on PRs
│   └── deploy.yml          Build → terraform apply → S3 sync on merge to main
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
| **Auto-expiry** | Rooms expire after 24 hours (DynamoDB TTL / MongoDB TTL index) |
| **DB-agnostic backend** | Swap between DynamoDB, MongoDB, or in-memory via `DB_DRIVER` env var |

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

#### Switch to DynamoDB Local

```bash
DB_DRIVER=dynamodb docker compose --profile dynamodb up
```

This starts DynamoDB Local on port 8000 and automatically creates the `BadmintonRooms` table.

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
DB_DRIVER=memory npm run dev --workspace=backend          # no DB needed
DB_DRIVER=mongodb npm run dev --workspace=backend         # local MongoDB on 27017
DYNAMODB_ENDPOINT=http://localhost:8000 \
  DB_DRIVER=dynamodb npm run dev --workspace=backend      # DynamoDB Local

# Frontend (separate terminal)
npm run dev --workspace=frontend
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` → `http://localhost:3001`.

---

## Deployment (AWS via Terraform)

Infrastructure is managed with Terraform in `infra/`. CI/CD is handled by GitHub Actions.

### First-time setup

1. **Bootstrap remote state** — create an S3 bucket and DynamoDB lock table manually, then uncomment the `backend "s3"` block in `infra/main.tf`.

2. **Add GitHub Actions secrets:**

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM credentials with Lambda + DynamoDB + S3 access |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret key |
| `AWS_REGION` | Target region (e.g. `ap-southeast-1`) |
| `VITE_API_BASE` | Lambda Function URL (set after first deploy) |
| `ALLOWED_ORIGIN` | Frontend URL for CORS (e.g. `https://your-app.com`) |

3. **Push to `main`** — the deploy workflow runs automatically:
   - Builds the Lambda zip (esbuild) and the frontend (Vite)
   - Runs `terraform apply` (Lambda + DynamoDB + S3)
   - Syncs the frontend build to S3

### CI pipeline (on every PR)

- Frontend: `vite build`
- Backend: esbuild Lambda bundle
- Terraform: `terraform validate` + `terraform fmt -check -recursive`

---

## Architecture

### Request flow

```
Browser  →  POST /rooms/1234/match/done  →  Lambda / Node server
                                         →  DB write (version: 5 → 6)
Browser  ←  SSE: room state v6           ←  SSE handler polls DB every 2s
```

### Real-time (SSE)

- Each client opens an `EventSource` to `GET /rooms/:code/events`
- The SSE handler polls the database every 2 seconds and streams a `data:` event whenever the room `version` increases
- If a tab is backgrounded and SSE drops, a `GET /rooms/:code` on re-focus catches up
- Lambda Function URL with `InvokeMode: RESPONSE_STREAM` supports connections up to 15 minutes

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
| `dynamodb` (default) | `DynamoRepository` | Lambda / production |
| `mongodb` | `MongoRepository` | Docker Compose / self-hosted |
| `memory` | `InMemoryRepository` | Tests / zero-dependency local |

All drivers implement the same interface and normalise version-conflict errors to `VersionConflictError`.

### Match generation fairness

- **MinHeap** keeps players sorted by `gamesPlayed` in O(log n)
- **Doubles:** picks 4 lowest-count players, evaluates all 3 possible 2v2 splits, chooses the split with fewest repeated partner pairings
- **Pinned matches** survive regeneration — `regenerateUnpinnedMatches()` preserves manually edited matches in-place and inflates virtual gamesPlayed for players locked into pinned slots

# Backend — Badminton Match App

Node.js REST + SSE API. Runs on **AWS Lambda** in production and as a plain **Node HTTP server** locally (no SAM or Lambda runtime needed).

## Stack

| Tool | Purpose |
|---|---|
| Node.js 20 (ESM) | Runtime |
| Express 4 | Routing (local dev + Lambda URL matching) |
| p-retry 8 | DB retry with exponential backoff |
| AWS SDK v3 | DynamoDB client |
| MongoDB Node.js driver v6 | MongoDB client |
| esbuild | Bundles handler for Lambda deployment |

## Project structure

```
backend/
├── src/
│   ├── app.js                Express app — assembles all routes (local dev)
│   ├── handler.js            AWS Lambda entry point — response streaming + SSE
│   ├── server.js             Local dev HTTP server (imports app.js)
│   ├── helpers.js            Shared utilities: CORS, safeRoom, withTransaction, withRetry
│   ├── matchGen.js           Fair match generation (MinHeap, O(log n))
│   ├── commands/
│   │   ├── Command.js        Abstract base class — enforces execute(room) interface
│   │   ├── MatchDoneCommand.js
│   │   ├── SkipMatchCommand.js
│   │   ├── EditMatchCommand.js
│   │   └── index.js          Re-exports all commands
│   ├── services/
│   │   ├── roomService.js    Room lifecycle: create, join, get, start, addMatches
│   │   ├── matchService.js   Match mutations: done, skip, edit
│   │   └── sessionService.js Session utilities: undo, SSE events
│   ├── validation/
│   │   ├── roomValidators.js  Room-level guards (exists, host, started, active match…)
│   │   ├── inputValidators.js Input guards (player name, winner, teams, match index…)
│   │   └── index.js           Re-exports all validators
│   └── db/
│       ├── index.js           Repository factory (reads DB_DRIVER env var)
│       ├── errors.js          VersionConflictError (shared across drivers)
│       ├── DynamoRepository.js   AWS DynamoDB (production)
│       ├── MongoRepository.js    MongoDB (docker-compose / self-hosted)
│       └── InMemoryRepository.js Map-backed store (tests / zero-dep local)
├── build.mjs             esbuild script → dist/lambda.zip
├── Dockerfile            Local dev container (runs server.js)
└── package.json
```

## API routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/rooms` | Create a room — returns `hostToken` |
| `POST` | `/rooms/:code/join` | Join a room by code |
| `GET` | `/rooms/:code` | Fetch current room state |
| `POST` | `/rooms/:code/start` | Generate matches and start session (host only) |
| `POST` | `/rooms/:code/match/done` | Mark active match done, advance (host only) |
| `POST` | `/rooms/:code/match/skip` | Skip one player out of active match (host only) — see below |
| `PATCH` | `/rooms/:code/match` | Edit a match's teams, re-pin, regenerate pending (host only) |
| `POST` | `/rooms/:code/undo` | Undo last operation — pops snapshot stack (host only) |
| `POST` | `/rooms/:code/matches` | Append more generated matches (host only) |
| `GET` | `/rooms/:code/events` | SSE stream — polls DB every 2 s, pushes on version change |
| `OPTIONS` | `*` | CORS preflight |

Host-only routes require the `X-Host-Token` header (or `hostToken` in the request body).

### Per-player skip (`POST /match/skip`)

Pass `playerName` in the request body. The named player is substituted out by the bench player with the fewest `gamesPlayed`. If no eligible substitute exists, the whole match is skipped and the index advances.

A skipped player is placed in an **unavailability queue** and cannot be selected as a substitute for subsequent skips within the same match. They become eligible again once the match index advances.

## Database drivers

The database layer is abstracted behind a common repository interface. Switch drivers with the `DB_DRIVER` environment variable — no code changes needed.

| `DB_DRIVER` | Driver | When to use |
|---|---|---|
| `dynamodb` _(default)_ | `DynamoRepository` | Lambda / production |
| `mongodb` | `MongoRepository` | Docker Compose / self-hosted |
| `memory` | `InMemoryRepository` | Tests, zero-dependency local runs |

### Repository interface

Every driver implements the same methods:

```
getRoom(code)
createRoom(room)
saveState(code, patch, expectedVersion)
addPlayer(code, player, expectedVersion)
setFormat(code, format, expectedVersion)
startSession(code, matches, expectedVersion)
appendMatches(code, newMatches, expectedVersion)
```

Version-conflict errors are normalised to `VersionConflictError` regardless of which driver is in use.

## Optimistic concurrency

Every room has a `version` integer. All mutations:

1. Read the current `version`.
2. The repository atomically checks `version === expectedVersion` before writing.
3. On conflict → `VersionConflictError` → the transaction loop retries.

## Command pattern

State-mutating operations use the Command pattern under `src/commands/`:

```
command.execute(room) → { patch, logEntry }
```

All commands extend the `Command` base class, which enforces the `execute(room)` interface.

| Command | Trigger |
|---|---|
| `MatchDoneCommand(winner)` | `POST /match/done` — marks done, increments `gamesPlayed`, clears unavailable queue |
| `SkipMatchCommand(playerName)` | `POST /match/skip` — substitutes one player, manages unavailability queue |
| `EditMatchCommand(idx, t1, t2)` | `PATCH /match` — pins match, regenerates pending |

Undo is **not** a command — it restores a full state snapshot from the undo stack.

## Validation

All input and room-state guards live in `src/validation/` as pure functions:

```js
validator(req, room) → { status, error } | null
```

Services compose validators with `||` short-circuit — the first non-null result short-circuits and returns an error response before any command is executed.

## Transactions and retry

### DB-level retry (`withRetry`)

Every individual DB call is wrapped with `withRetry` (powered by `p-retry`):

- Up to **3 attempts** (1 initial + 2 retries)
- Exponential backoff: **300 ms → 600 ms**
- `VersionConflictError` bypasses retry immediately (handled at the transaction level)

### Transaction loop (`withTransaction`)

Command handlers run inside a transaction loop:

1. Re-read the room (with `withRetry`)
2. Run all validators — return error immediately if invalid
3. Execute the command (pure, no side-effects)
4. Persist (with `withRetry`)

On `VersionConflictError` the whole cycle (re-read → re-validate → re-execute → re-save) is retried with progressive delays: **300 ms → 600 ms → 900 ms** (up to 3 attempts). After the third failure a HTTP 409 is returned to the client.

`withDirectTransaction` follows the same loop but accepts a patch factory instead of a `Command` (used by undo).

## Environment variables

| Variable | Default | Driver |
|---|---|---|
| `DB_DRIVER` | `dynamodb` | All |
| `TABLE_NAME` | `BadmintonRooms` | DynamoDB |
| `DYNAMODB_ENDPOINT` | _(AWS default)_ | DynamoDB — set to `http://localhost:8000` for DynamoDB Local |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB |
| `MONGO_DB` | `badminton` | MongoDB |
| `ALLOWED_ORIGIN` | `*` | CORS — set to your frontend URL in production |
| `PORT` | `3001` | Local server only |

## Local development

### Without Docker

```bash
# From the repo root
npm install

# Start with in-memory store (no database required)
DB_DRIVER=memory npm run dev --workspace=backend

# Or point at a local MongoDB
MONGO_URI=mongodb://localhost:27017 DB_DRIVER=mongodb npm run dev --workspace=backend

# Or point at DynamoDB Local (must be running separately on port 8000)
DYNAMODB_ENDPOINT=http://localhost:8000 DB_DRIVER=dynamodb npm run dev --workspace=backend
```

### With Docker (full stack)

```bash
# From the repo root — starts backend + MongoDB + frontend
docker compose up

# Switch to DynamoDB Local (creates the table automatically)
DB_DRIVER=dynamodb docker compose --profile dynamodb up
```

The Docker image runs `node src/server.js` which starts a plain HTTP server on port 3001.

## Lambda build (production)

```bash
npm run build --workspace=backend
# Output: backend/dist/lambda.zip
```

`build.mjs` uses esbuild to bundle `src/handler.js` into `dist/handler.mjs` (ESM, `@aws-sdk/*` and `mongodb` excluded — the Lambda runtime provides AWS SDK and MongoDB is not used in Lambda). The bundle is then zipped to `dist/lambda.zip` for upload via Terraform.

## Deployment (Terraform)

Infrastructure lives in `infra/`. See the root README for full Terraform deployment instructions.

Required GitHub Actions secrets before first deploy:

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user with Lambda + DynamoDB + S3 permissions |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret key |
| `AWS_REGION` | Target region (e.g. `ap-southeast-1`) |
| `VITE_API_BASE` | Lambda Function URL for frontend build |
| `ALLOWED_ORIGIN` | Frontend URL for CORS (e.g. `https://your-app.com`) |

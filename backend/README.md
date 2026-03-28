# Backend — Badminton Match App

Node.js REST + SSE API. Runs on **AWS Lambda** in production and as a plain **Node HTTP server** locally (no SAM or Lambda runtime needed).

## Stack

| Tool | Purpose |
|---|---|
| Node.js 20 (ESM) | Runtime |
| AWS SDK v3 | DynamoDB client |
| MongoDB Node.js driver v6 | MongoDB client |
| esbuild | Bundles handler for Lambda deployment |

## Project structure

```
backend/
├── src/
│   ├── handler.js        All routes — REST + SSE streaming
│   ├── server.js         Local dev HTTP server (wraps handler.js)
│   ├── commands.js       Command pattern — MatchDone, Skip, EditMatch
│   ├── matchGen.js       Fair match generation (MinHeap, O(log n))
│   └── db/
│       ├── index.js      Repository factory (reads DB_DRIVER env var)
│       ├── errors.js     VersionConflictError (shared across drivers)
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
| `PATCH` | `/rooms/:code/format` | Change format (host only, pre-start) |
| `POST` | `/rooms/:code/start` | Generate matches and start session (host only) |
| `POST` | `/rooms/:code/match/done` | Mark active match done, advance (host only) |
| `POST` | `/rooms/:code/match/skip` | Skip active match, advance (host only) |
| `PATCH` | `/rooms/:code/match` | Edit a match's teams, re-pin, regenerate pending (host only) |
| `POST` | `/rooms/:code/undo` | Undo last operation — pops snapshot stack (host only) |
| `POST` | `/rooms/:code/matches` | Append more generated matches (host only) |
| `GET` | `/rooms/:code/events` | SSE stream — polls DB every 2 s, pushes on version change |
| `OPTIONS` | `*` | CORS preflight |

Host-only routes require the `X-Host-Token` header (or `hostToken` in the request body).

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
2. Send `version` in the request body.
3. The repository atomically checks `version === expectedVersion` before writing.
4. On conflict → `VersionConflictError` → HTTP 409 → client re-fetches and retries.

## Command pattern

State-mutating operations use the Command pattern (`src/commands.js`):

```
command.execute(room) → { patch, logEntry }
```

The central `runCommand()` in `handler.js` handles undo-snapshot and operation-log bookkeeping for every command uniformly.

| Command | Trigger |
|---|---|
| `MatchDoneCommand(winner)` | `POST /match/done` — marks done, increments gamesPlayed |
| `SkipMatchCommand` | `POST /match/skip` — marks skipped, no stat change |
| `EditMatchCommand(idx, t1, t2)` | `PATCH /match` — pins match, regenerates pending |

Undo is **not** a command — it restores a full state snapshot from the undo stack.

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

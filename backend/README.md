# Backend — Badminton Match App

Node.js REST + SSE API built with Express. See the [root README](../README.md) for local development and deployment instructions.

## Stack

| Tool | Purpose |
|---|---|
| Node.js 20 (ESM) | Runtime |
| Express | HTTP server + routing |
| MongoDB Node.js driver v6 | Default database client |
| p-retry | Exponential-backoff retry for DB calls |

## Project structure

```
backend/
├── src/
│   ├── app.js              Express app (local dev + any Node.js deployment)
│   ├── server.js           Entry point — starts HTTP server on $PORT
│   ├── config.js           Shared constants: CORS headers, MAX_UNDO, MAX_LOG, MAX_PLAYER_NAME_LENGTH
│   ├── errors.js           Centralised error message constants (ERRORS map + dynamic helpers)
│   ├── roomUtils.js        Room serialisation (safeRoom) + undo/log stack helpers
│   ├── matchGen.js         Fair match generation (MinHeap, O(log n))
│   ├── commands/
│   │   ├── Command.js          Abstract base class
│   │   ├── MatchDoneCommand.js Mark match done, advance session
│   │   ├── SkipMatchCommand.js Skip/substitute a player
│   │   ├── EditMatchCommand.js Edit teams + pin + regenerate pending
│   │   └── index.js            Re-exports
│   ├── routes/
│   │   ├── index.js        Express Router — registers all routes
│   │   ├── helpers.js      Shared: db instance, hostToken, runCommand, logRequest
│   │   ├── rooms.js        Room lifecycle: create, join, get, start, addMatches
│   │   ├── matches.js      Match operations: done, skip, edit
│   │   ├── session.js      Session control: undo
│   │   └── sse.js          SSE stream handler
│   ├── validation/
│   │   ├── index.js            Re-exports
│   │   ├── inputValidators.js  Request body validation
│   │   └── roomValidators.js   Room state validation
│   └── db/
│       ├── index.js              Repository factory (reads DB_DRIVER env var)
│       ├── errors.js             VersionConflictError (shared across drivers)
│       ├── transaction.js        withRetry, withTransaction, withDirectTransaction
│       ├── MongoRepository.js    MongoDB (default)
│       └── InMemoryRepository.js Map-backed store (tests / zero-dependency local)
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
| `POST` | `/rooms/:code/match/skip` | Skip active match, advance (host only) |
| `PATCH` | `/rooms/:code/match` | Edit a match's teams, re-pin, regenerate pending (host only) |
| `POST` | `/rooms/:code/undo` | Undo last operation — pops snapshot stack (host only) |
| `POST` | `/rooms/:code/matches` | Append more generated matches (host only) |
| `GET` | `/rooms/:code/events` | SSE stream — polls DB every 2 s, pushes on version change |
| `OPTIONS` | `*` | CORS preflight |

Host-only routes require the `X-Host-Token` header (or `hostToken` in the request body).

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DB_DRIVER` | `mongodb` | `mongodb` or `memory` |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `badminton` | MongoDB database name |
| `ALLOWED_ORIGIN` | `*` | CORS — set to your frontend URL in production |
| `PORT` | `3001` | HTTP server port |

## Database drivers

| `DB_DRIVER` | Driver | When to use |
|---|---|---|
| `mongodb` _(default)_ | `MongoRepository` | Docker Compose / Cloud Run / self-hosted |
| `memory` | `InMemoryRepository` | Tests, zero-dependency local runs |

Every driver implements the same interface (`getRoom`, `createRoom`, `saveState`, `addPlayer`, `startSession`, `appendMatches`) and normalises version-conflict errors to `VersionConflictError`.

## Optimistic concurrency

Every room has a `version` integer. All mutations read the current version, send it in the request body, and the repository atomically checks `version === expectedVersion` before writing. On conflict → `VersionConflictError` → HTTP 409 → client re-fetches and retries.

## Command pattern

State-mutating operations use the Command pattern (`src/commands/`):

```
command.execute(room) → { patch, logEntry }
```

The central `runCommand()` in `routes/helpers.js` handles undo-snapshot and operation-log bookkeeping for every command uniformly.

| Command | Trigger |
|---|---|
| `MatchDoneCommand(winner)` | `POST /match/done` — marks done, increments gamesPlayed |
| `SkipMatchCommand(playerName)` | `POST /match/skip` — marks skipped or substitutes bench player |
| `EditMatchCommand(idx, t1, t2)` | `PATCH /match` — pins match, regenerates pending |

Undo restores a full state snapshot (not re-execution).

## TODO / Future improvements

- **Tests** — no test suite exists yet; unit tests for commands and integration tests for the API are the highest-value addition
- **Rate limiting** — no per-IP limit on room creation
- **Max total matches per room** — `addMatches` capped at 20 per call but no lifetime cap
- **TypeScript / JSDoc types** — data model shapes are well-defined but not type-checked
- **Structured request logging** — `logRequest` utility exists in `routes/helpers.js` but not yet wired to all handlers

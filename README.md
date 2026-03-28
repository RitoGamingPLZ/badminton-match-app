# 🏸 Badminton Match App

A real-time badminton match scheduler for friend groups. Create a room, share the 4-digit code, everyone joins on their own phone, and the app handles the rest — fair match generation, live updates, and result tracking.

## Monorepo structure

```
badminton-match-app/
├── backend/          AWS Lambda + DynamoDB (SSE + REST API)
│   ├── src/
│   │   ├── handler.js      All routes — REST + SSE streaming
│   │   ├── matchGen.js     Fair match generation algorithm
│   │   └── dynamo.js       DynamoDB helpers (optimistic locking)
│   ├── template.yaml       AWS SAM deployment template
│   └── package.json
├── frontend/         Vue 3 + Vite SPA
│   ├── src/
│   │   ├── api.js          REST + SSE client
│   │   ├── store/room.js   Pinia store (state + actions)
│   │   ├── views/          HomeView, CreateView, JoinView, LobbyView, SessionView
│   │   └── components/     FormatPicker, MatchCourt, EditMatchModal
│   └── package.json
└── package.json      Workspace root
```

---

## Features

| Feature | Details |
|---|---|
| **Create room** | Host gets a 4-digit code instantly |
| **Join room** | Players join on their own phones |
| **Doubles & Singles** | Supports 2v2, 1v1, or mixed |
| **Fair scheduling** | Players with fewest games are picked first; teams rotate to avoid same-partner repetition |
| **Edit current match** | Host can swap players in/out mid-session; pending schedule regenerates automatically preserving fairness |
| **Live updates** | SSE (Server-Sent Events) — no WebSockets needed |
| **Tab resync** | GET /rooms/:code on tab focus catches up missed events |
| **Version control** | Optimistic locking via `version` attribute — no race conditions |
| **Auto-expiry** | Rooms auto-delete from DynamoDB after 24 hours (TTL) |

---

## Deployment

### Prerequisites

```bash
# AWS CLI
brew install awscli   # macOS
aws configure         # set your region + credentials

# AWS SAM CLI
brew install aws-sam-cli

# Node 20+
node --version
```

### 1 — Deploy the backend

```bash
cd backend
npm install
sam build
sam deploy --guided
# Choose a stack name, region, and accept defaults.
# Note the ApiUrl from the Outputs section.
```

After deployment, CloudFormation prints:

```
ApiUrl = https://xxxxxxxxxxxx.lambda-url.ap-southeast-1.on.aws/
```

### 2 — Configure the frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local and set:
#   VITE_API_BASE=https://xxxxxxxxxxxx.lambda-url.ap-southeast-1.on.aws
```

### 3 — Build and deploy the frontend

**Option A — Vercel (recommended, free)**
```bash
npm i -g vercel
cd frontend
vercel deploy --prod
```

**Option B — Netlify**
```bash
npm i -g netlify-cli
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

**Option C — AWS S3 + CloudFront**
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
```

### 4 — Set CORS (production)

In `backend/template.yaml`, change the `AllowedOrigin` parameter to your frontend URL:

```bash
sam deploy --parameter-overrides AllowedOrigin=https://your-app.vercel.app
```

---

## Local development

You need AWS credentials pointing to a real DynamoDB table **or** use DynamoDB Local.

```bash
# Terminal 1 — backend (SAM local)
cd backend
npm install
sam build
sam local start-api --port 3001 --warm-containers EAGER

# Terminal 2 — frontend (Vite dev server)
cd frontend
npm install
cp .env.example .env.local
# Leave VITE_API_BASE unset — Vite proxies /api/* → localhost:3001
npm run dev
```

Open http://localhost:5173 — the Vite proxy forwards API calls to SAM local.

---

## Architecture

### Real-time: SSE over Lambda Streaming

```
Phone A  →  POST /rooms/1234/match/done  →  Lambda  →  DynamoDB (version: 5 → 6)
Phone B  ←  SSE: version 6 room state   ←  Lambda polls DynamoDB every 2s
```

- Each client holds an open `EventSource` connection to `GET /rooms/:code/events`
- The SSE Lambda polls DynamoDB every 2 seconds and streams a `data:` event when the `version` increments
- If a tab is backgrounded and the SSE drops, a `GET /rooms/:code` REST call on re-focus catches up
- Lambda Function URLs with `InvokeMode: RESPONSE_STREAM` allow connections up to 15 minutes

### Optimistic locking

Every mutation:
1. Reads the current `version`
2. Sends `version` with the request body
3. Lambda uses DynamoDB `ConditionExpression: version = :expected` + atomically increments
4. On `ConditionalCheckFailedException` (409) → client re-fetches and can retry

### Match generation fairness

**Doubles (2v2):** For each round, picks the 4 players with fewest `gamesPlayed`. Among the 3 possible ways to split 4 into 2 teams, picks the split with fewest repeated partner pairings.

**Singles (1v1):** Pairs players who have played the fewest games and haven't faced each other yet.

**Edit match:** Editing the active match updates `team1`/`team2`, then regenerates all `pending` matches using the current `gamesPlayed` counts as the baseline — so fairness is preserved going forward.

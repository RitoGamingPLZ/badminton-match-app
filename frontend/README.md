# Frontend — Badminton Match App

Vue 3 single-page application built with Vite and Tailwind CSS v4. See the [root README](../README.md) for local development instructions.

## Stack

| Tool | Version | Purpose |
|---|---|---|
| Vue 3 | ^3.4 | Reactive UI framework |
| Pinia | ^2.1 | State management |
| Vite | ^5.2 | Dev server and bundler |
| Tailwind CSS v4 | ^4.0 | Utility-first CSS (CSS-first config via `@import "tailwindcss"`) |
| `@tailwindcss/vite` | ^4.0 | Vite plugin — no PostCSS config needed |

## Project structure

```
frontend/
├── src/
│   ├── main.js               Entry point — mounts Vue app, imports style.css
│   ├── style.css             Tailwind import + shared transitions / keyframes
│   ├── App.vue               Root component — renders the active view
│   ├── api.js                REST + SSE client functions
│   ├── utils.js              Shared helpers (e.g. avatarColor)
│   ├── store/
│   │   └── room.js           Pinia store — full app state + all API actions
│   ├── components/
│   │   ├── FormatPicker.vue  Doubles / Singles / Both selector
│   │   └── MatchCourt.vue    Live match card (teams + winner buttons)
│   └── views/
│       ├── HomeView.vue      Create room or join with a code
│       ├── LobbyView.vue     Pre-start lobby — format picker, player list
│       ├── SessionView.vue   Active session — match controls, history, undo
│       └── EditMatchesView.vue  Edit any pending match, pin + regenerate
├── index.html
├── vite.config.js
├── Dockerfile                Local dev container (vite dev --host)
└── package.json
```

## Views

The app has no router — navigation is driven by a `view` string in the Pinia store.

| View | Shown when |
|---|---|
| `home` | Initial load, or after leaving a room |
| `lobby` | Room joined but session not yet started |
| `session` | Session started — match controls visible |
| `editMatches` | Host opens the edit-matches panel |

## API communication

All API calls go through `src/api.js`. The base URL is controlled by the `VITE_API_BASE` environment variable (falls back to the Vite dev proxy at `/api`).

Real-time updates use **Server-Sent Events** via a persistent `EventSource` connection to `GET /rooms/:code/events`. On tab focus, a REST `GET /rooms/:code` re-syncs state in case the SSE dropped while the tab was backgrounded.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE` | _(unset — uses proxy)_ | Override API URL for production builds |
| `API_TARGET` | `http://localhost:3001` | Vite proxy target — set to `http://backend:3001` by docker-compose |

Create a `.env.local` file at `frontend/` to override locally:

```env
VITE_API_BASE=https://your-backend-url
```

## Build (production)

```bash
npm run build --workspace=frontend
# Output: frontend/dist/
```

The `dist/` folder is a static site — deploy it to any CDN (S3, Cloudflare Pages, Vercel, Netlify). Set `VITE_API_BASE` to your deployed backend URL before building.

## Tailwind CSS v4

This project uses the CSS-first Tailwind v4 approach — there is no `tailwind.config.js`. The entire setup is in `src/style.css`:

```css
@import "tailwindcss";
/* custom keyframes, transitions, etc. */
```

The `@tailwindcss/vite` plugin handles scanning and compilation automatically.

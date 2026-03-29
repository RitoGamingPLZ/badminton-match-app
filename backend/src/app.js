/**
 * Express application — assembles all routes for local development.
 *
 * Route handlers live in dedicated service modules:
 *   services/roomService.js   — room lifecycle (create, join, get, start, addMatches)
 *   services/matchService.js  — match mutations (done, skip, edit)
 *   services/sessionService.js — session utilities (undo, SSE events)
 *
 * Commands live in commands/:
 *   commands/MatchDoneCommand.js
 *   commands/SkipMatchCommand.js
 *   commands/EditMatchCommand.js
 */

import express from 'express';
import { corsHeaders } from './helpers.js';
import { createRoom, joinRoom, getRoom, startSession, addMatches } from './services/roomService.js';
import { markMatchDone, skipMatch, editMatch } from './services/matchService.js';
import { undoLastOperation, sseEvents } from './services/sessionService.js';

const app = express();

app.use(express.json());

// CORS + preflight
app.use((req, res, next) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.post('/rooms',                   createRoom);
app.get('/rooms/:code',              getRoom);
app.get('/rooms/:code/events',       sseEvents);
app.post('/rooms/:code/join',        joinRoom);
app.post('/rooms/:code/start',       startSession);
app.post('/rooms/:code/match/done',  markMatchDone);
app.post('/rooms/:code/match/skip',  skipMatch);
app.post('/rooms/:code/undo',        undoLastOperation);
app.patch('/rooms/:code/match',      editMatch);
app.post('/rooms/:code/matches',     addMatches);

// ── Fallbacks ─────────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;

/**
 * Express application — local development and any Node.js deployment
 * (Cloud Run, Docker, VPS, etc.).
 */

import express from 'express';
import { corsHeaders } from './config.js';
import { ServiceError } from './errors.js';
import { createRoom, joinRoom, getRoom, startSession, addMatches } from './routes/rooms.js';
import { markMatchDone, skipMatch, editMatch } from './routes/matches.js';
import { undoLastOperation } from './routes/session.js';
import { sseEvents } from './routes/sse.js';

const app = express();

app.use(express.json());

// ── CORS + preflight ──────────────────────────────────────────────────────────

app.use((req, res, next) => {
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
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
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;

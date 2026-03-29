/**
 * Express application — local development and any Node.js deployment
 * (Cloud Run, Docker, VPS, etc.).
 */

import express from 'express';
import { corsHeaders } from './config.js';
import { router } from './routes/index.js';

const app = express();

app.use(express.json());

// ── CORS + preflight ──────────────────────────────────────────────────────────

app.use((req, res, next) => {
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use(router);

// ── Fallbacks ─────────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;

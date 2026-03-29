/**
 * Express application — assembles all routes for local development.
 *
 * Uses the same Lambda route handlers as the production handler.js, via an
 * awslambda shim that adapts Express req/res to the Lambda streaming interface.
 * This removes the parallel services/ layer so business logic lives in one place.
 *
 * The shim translates:
 *   awslambda.HttpResponseStream.from(expressRes, { statusCode, headers })
 *   → calls expressRes.status() / setHeader() / flushHeaders(), returns expressRes
 *
 * Routes are registered here because routes/index.js wires to the Lambda
 * router (req._event / res._stream shims) and SSE needs its own treatment.
 */

import express from 'express';
import { corsHeaders } from './config.js';
import { router } from './routes/index.js';
import { handleSSE } from './routes/sse.js';

// ── awslambda shim for local Express environment ───────────────────────────────

if (typeof awslambda === 'undefined') {
  globalThis.awslambda = {
    streamifyResponse: fn => fn,
    HttpResponseStream: {
      from(expressRes, { statusCode = 200, headers = {} } = {}) {
        expressRes.status(statusCode);
        for (const [k, v] of Object.entries(headers)) expressRes.setHeader(k, v);
        expressRes.flushHeaders();
        return expressRes;
      },
    },
  };
}

const app = express();

app.use(express.json());

// ── CORS + preflight ──────────────────────────────────────────────────────────

app.use((req, res, next) => {
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── Adapt Express req/res to Lambda-style _event / _stream ───────────────────

app.use((req, res, next) => {
  req._event = {
    body:                    JSON.stringify(req.body || {}),
    headers:                 req.headers,
    queryStringParameters:   req.query,
    requestContext:          { http: { method: req.method } },
    rawPath:                 req.path,
  };
  res._stream = res;
  next();
});

// ── SSE — direct, before the Lambda router ────────────────────────────────────

app.get('/rooms/:code/events', (req, res) =>
  handleSSE(req.params.code, req._event, res._stream)
);

// ── All other routes — reuse the Lambda router ────────────────────────────────

app.use(router);

// ── Fallbacks ─────────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;

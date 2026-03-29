/**
 * Lambda entry point — REST + SSE.
 *
 * Uses Lambda Response Streaming (awslambda.streamifyResponse) so that
 * SSE connections can stay open for up to 15 minutes without hitting the
 * 29-second API Gateway limit.  Non-SSE routes write once and end immediately.
 *
 * Routing uses an express.Router for URL pattern matching and param extraction.
 * SSE is handled before Express to preserve Lambda Response Streaming.
 *
 * Routes
 * ──────
 * POST   /rooms                      → createRoom
 * POST   /rooms/:code/join           → joinRoom
 * GET    /rooms/:code                → getRoom
 * POST   /rooms/:code/start          → startSession
 * PATCH  /rooms/:code/match          → editMatch   (Command: EditMatchCommand)
 * POST   /rooms/:code/match/done     → markMatchDone (Command: MatchDoneCommand)
 * POST   /rooms/:code/match/skip     → skipMatch   (Command: SkipMatchCommand)
 * POST   /rooms/:code/undo           → undoLastOperation
 * POST   /rooms/:code/matches        → addMatches
 * GET    /rooms/:code/events         → SSE stream
 * OPTIONS *                          → CORS preflight
 */

import { corsHeaders } from './config.js';
import { router } from './routes/index.js';
import { handleSSE } from './routes/sse.js';
import { err } from './routes/helpers.js';

// ── Local-dev shim ────────────────────────────────────────────────────────────
if (typeof awslambda === 'undefined') {
  console.warn('[shim] awslambda not found — using no-op shim (SSE will not stream)');
  globalThis.awslambda = {
    streamifyResponse: (fn) => fn,
    HttpResponseStream: { from(stream) { return stream; } },
  };
}

// ── Router dispatch ───────────────────────────────────────────────────────────

function dispatchViaRouter(event, responseStream) {
  return new Promise((resolve) => {
    const method = (event.requestContext?.http?.method ?? event.httpMethod ?? 'GET').toUpperCase();
    const url    = event.rawPath ?? event.path ?? '/';

    const req = { method, url, _event: event };
    const res = { _stream: responseStream };

    router(req, res, () => {
      err(responseStream, 404, 'Not found');
      resolve();
    });
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-undef
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const method  = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  const rawPath = event.rawPath ?? event.path ?? '/';

  if (method === 'OPTIONS') {
    // eslint-disable-next-line no-undef
    const s = awslambda.HttpResponseStream.from(responseStream, { statusCode: 204, headers: corsHeaders });
    s.end();
    return;
  }

  // SSE must bypass Express — needs raw Lambda stream for long-lived streaming
  const parts = rawPath.split('/').filter(Boolean);
  if (method === 'GET' && parts[2] === 'events') {
    return await handleSSE(parts[1], event, responseStream);
  }

  try {
    await dispatchViaRouter(event, responseStream);
  } catch (error) {
    console.error('Unhandled error:', error);
    err(responseStream, 500, 'Internal server error');
  }
});

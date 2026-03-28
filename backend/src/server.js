/**
 * Local development HTTP server.
 *
 * Wraps the Lambda handler with a plain Node.js HTTP server so you can run
 * the backend locally without SAM or any Lambda runtime.  Designed to be
 * used via docker-compose or a plain `node src/server.js`.
 *
 * The awslambda shim is installed BEFORE handler.js is imported (dynamic
 * import below) so the handler sees a proper implementation rather than the
 * no-op fallback bundled inside handler.js.
 */

import http from 'node:http';

const PORT = process.env.PORT || 3001;

// ── awslambda shim ─────────────────────────────────────────────────────────────
// Must be set before handler.js is evaluated.  The shim translates the Lambda
// response-stream API to plain Node ServerResponse calls.
globalThis.awslambda = {
  streamifyResponse: (fn) => fn,

  HttpResponseStream: {
    from(res, { statusCode, headers } = {}) {
      // Apply status + headers if not already written (first call per request)
      if (!res.headersSent) {
        if (statusCode) res.statusCode = statusCode;
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            res.setHeader(key, value);
          }
        }
      }
      return res;
    },
  },
};

// Dynamic import so the shim above is visible when handler.js initialises
const { handler } = await import('./handler.js');

// ── HTTP server ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Collect request body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks).toString() : null;

  // Build a Lambda-compatible event object
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const queryStringParameters = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });

  const event = {
    requestContext: { http: { method: req.method } },
    rawPath:               url.pathname,
    queryStringParameters,
    headers:               req.headers,
    body,
  };

  try {
    await handler(event, res);
  } catch (err) {
    console.error('[server] unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  console.log(`DB_DRIVER : ${process.env.DB_DRIVER || 'dynamodb'}`);
});

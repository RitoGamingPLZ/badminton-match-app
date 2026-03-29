/**
 * Shared helpers for Express route handlers.
 */

/** Extract the host token from request headers or body. */
export function hostToken(req) {
  return req.headers['x-host-token'] || req.body?.hostToken || '';
}

/** Write a single structured JSON log line per request. */
export function logRequest(method, path, status) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), method, path, status }));
}

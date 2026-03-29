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

/**
 * Wrap a route handler so it handles try/catch/next, logging, and JSON
 * response in one place.
 *
 * @param {Function} fn     - async (req, res) => result
 * @param {number}   status - HTTP status code (default 200)
 */
export function wrapRoute(fn, status = 200) {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res);
      logRequest(req.method, req.path, status);
      res.status(status).json(result);
    } catch (e) { next(e); }
  };
}

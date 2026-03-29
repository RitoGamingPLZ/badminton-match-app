/**
 * Low-level retry helpers for repository operations.
 *
 * - sleep     — promise-based delay
 * - withRetry — wraps a single DB call with exponential-backoff retries
 *               (VersionConflictError is never retried here; it is handled
 *               at the service-layer transaction level)
 */

import pRetry, { AbortError } from 'p-retry';
import { VersionConflictError } from './errors.js';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a DB operation up to 3 times with exponential backoff (300 ms base).
 * VersionConflictError aborts immediately — callers handle it at a higher level.
 */
export function withRetry(fn) {
  return pRetry(fn, {
    retries: 2,       // 2 retries = 3 total attempts
    minTimeout: 300,
    factor: 2,        // 300 ms → 600 ms
    onFailedAttempt(err) {
      if (err instanceof VersionConflictError) throw new AbortError(err);
    },
  });
}

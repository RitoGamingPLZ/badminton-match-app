/**
 * Retry helpers for repository operations.
 *
 * - sleep              — promise-based delay
 * - withRetry          — wraps a single DB call with exponential-backoff retries
 * - withConflictRetry  — service-level optimistic-concurrency retry loop
 */

import pRetry, { AbortError } from 'p-retry';
import { VersionConflictError } from './errors.js';
import { ServiceError, ERRORS } from '../errors.js';
import { TRANSACTION_DELAYS_MS } from '../config.js';

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

/**
 * Retry a save operation on VersionConflictError with TRANSACTION_DELAYS_MS
 * progressive backoff. Calls onConflict() between attempts so the caller can
 * re-read the room and refresh its closure state.
 *
 * @param {Function} saveFn     - async () => result
 * @param {Function} onConflict - async (attempt) => void
 */
export async function withConflictRetry(saveFn, onConflict) {
  for (let attempt = 0; attempt < TRANSACTION_DELAYS_MS.length; attempt++) {
    try {
      return await saveFn();
    } catch (e) {
      if (!(e instanceof VersionConflictError)) throw e;
      if (attempt === TRANSACTION_DELAYS_MS.length - 1)
        throw new ServiceError(409, ERRORS.VERSION_CONFLICT);
      await sleep(TRANSACTION_DELAYS_MS[attempt]);
      await onConflict(attempt);
    }
  }
}

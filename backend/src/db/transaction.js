/**
 * Retry and transaction helpers for repository operations.
 *
 * - withRetry       — wraps a single DB call with exponential-backoff retries
 * - withTransaction — executes a Command with optimistic-concurrency retry loop
 * - withDirectTransaction — like withTransaction but for patch-factory operations (e.g. undo)
 */

import pRetry, { AbortError } from 'p-retry';
import { VersionConflictError } from './errors.js';
import { makeSnapshot, pushUndo, pushLog, safeRoom } from '../roomUtils.js';

const TRANSACTION_DELAYS_MS = [300, 600, 900];

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a DB operation up to 3 times with exponential backoff (300 ms base).
 * VersionConflictError is never retried here — it is handled at the transaction level.
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
 * Execute a Command transactionally with optimistic-concurrency retry.
 *
 * On each attempt:
 *   1. Re-read the room (with retry on transient errors)
 *   2. Run validators — return error immediately if invalid
 *   3. Execute the command (pure, no side-effects)
 *   4. Persist (with retry on transient errors)
 *
 * On VersionConflictError: wait progressively and retry the whole cycle
 * up to 3 times total.
 *
 * @param {object}   db          - repository instance
 * @param {string}   code        - room code
 * @param {object}   req         - Express request
 * @param {object}   res         - Express response
 * @param {Function} validate    - (req, room) => { status, error } | null
 * @param {Function} makeCommand - (req, room) => Command instance
 */
export async function withTransaction(db, code, req, res, validate, makeCommand) {
  for (let attempt = 0; attempt < TRANSACTION_DELAYS_MS.length; attempt++) {
    const room = await withRetry(() => db.getRoom(code));

    const invalid = validate(req, room);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });

    const command      = makeCommand(req, room);
    const snapshot     = makeSnapshot(room);
    const { patch, logEntry } = command.execute(room);
    const undoStack    = pushUndo(room, snapshot);
    const operationLog = pushLog(room, logEntry);

    try {
      const updated = await withRetry(() =>
        db.saveState(code, { ...patch, undoStack, operationLog }, room.version)
      );
      return res.status(200).json({ room: safeRoom(updated) });
    } catch (e) {
      if (e instanceof VersionConflictError) {
        if (attempt === TRANSACTION_DELAYS_MS.length - 1)
          return res.status(409).json({ error: 'Version conflict — reload and retry' });
        await sleep(TRANSACTION_DELAYS_MS[attempt]);
        continue;
      }
      throw e;
    }
  }
}

/**
 * Transactional direct state save for operations that don't follow the
 * Command pattern (e.g. undo).
 *
 * Same retry semantics as withTransaction but accepts a patch factory
 * instead of a command factory.
 *
 * @param {object}   db        - repository instance
 * @param {string}   code      - room code
 * @param {object}   req       - Express request
 * @param {object}   res       - Express response
 * @param {Function} validate  - (req, room) => { status, error } | null
 * @param {Function} makePatch - (req, room) => patch object for db.saveState
 */
export async function withDirectTransaction(db, code, req, res, validate, makePatch) {
  for (let attempt = 0; attempt < TRANSACTION_DELAYS_MS.length; attempt++) {
    const room = await withRetry(() => db.getRoom(code));

    const invalid = validate(req, room);
    if (invalid) return res.status(invalid.status).json({ error: invalid.error });

    const patch = makePatch(req, room);

    try {
      const updated = await withRetry(() =>
        db.saveState(code, patch, room.version)
      );
      return res.status(200).json({ room: safeRoom(updated) });
    } catch (e) {
      if (e instanceof VersionConflictError) {
        if (attempt === TRANSACTION_DELAYS_MS.length - 1)
          return res.status(409).json({ error: 'Version conflict — reload and retry' });
        await sleep(TRANSACTION_DELAYS_MS[attempt]);
        continue;
      }
      throw e;
    }
  }
}

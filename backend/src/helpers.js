/**
 * Shared helpers used by service modules and the Lambda handler.
 */

import pRetry, { AbortError } from 'p-retry';
import { VersionConflictError } from './db/index.js';
import { applyEvent } from './events/applyEvent.js';

export const MAX_UNDO = 10;
export const MAX_LOG  = 50;

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, X-Host-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

// ── Room serialisation ────────────────────────────────────────────────────────

/** Strip internal fields before sending to clients. */
export function safeRoom(room) {
  return {
    code:                room.code,
    version:             room.version,
    format:              room.format,
    started:             room.started,
    players:             room.players.map(p => ({ name: p.name, gamesPlayed: p.gamesPlayed })),
    matches:             room.matches,
    currentMatchIndex:   room.currentMatchIndex,
    operationLog:        room.operationLog        || [],
    unavailablePlayers:  room.unavailablePlayers  || [],
    canUndo:             (room.undoStack          || []).length > 0,
  };
}

// ── Undo / log stack helpers ──────────────────────────────────────────────────

export function pushUndo(room, snapshot) {
  return [...(room.undoStack || []), snapshot].slice(-MAX_UNDO);
}

export function pushLog(room, entry) {
  return [...(room.operationLog || []), { ...entry, ts: new Date().toISOString() }].slice(-MAX_LOG);
}

// ── Undo snapshot ─────────────────────────────────────────────────────────────

/** Snapshot of all fields that commands may mutate (used for undo). */
export function makeSnapshot(room) {
  return {
    matches:             room.matches,
    players:             room.players,
    currentMatchIndex:   room.currentMatchIndex,
    unavailablePlayers:  room.unavailablePlayers || [],
  };
}

// ── Retry / transaction helpers ───────────────────────────────────────────────

const TRANSACTION_DELAYS_MS = [300, 600, 900];

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a DB operation up to 3 times with exponential backoff (300 ms base).
 * VersionConflictError is never retried — it is handled at the transaction level.
 * Uses p-retry under the hood.
 */
export function withRetry(fn) {
  return pRetry(fn, {
    retries: 2,          // 2 retries = 3 total attempts
    minTimeout: 300,
    factor: 2,           // 300 ms → 600 ms
    onFailedAttempt(err) {
      if (err instanceof VersionConflictError) throw new AbortError(err);
    },
  });
}

/**
 * Execute a Command transactionally.
 *
 * On each attempt:
 *   1. Re-read the room (with retry on transient errors)
 *   2. Run validators — return error immediately if invalid
 *   3. Execute the command (pure, no side-effects)
 *   4. Persist (with retry on transient errors)
 *
 * On VersionConflictError: wait progressively and retry the whole cycle
 * (re-read → re-validate → re-execute → re-save) up to 3 times.
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
    const { event, logEntry } = command.execute(room);
    const patch        = applyEvent(room, event);
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
 * Transactional direct state save (for operations that don't follow the
 * Command pattern, e.g. undo).
 *
 * Same retry semantics as withTransaction, but instead of a Command it
 * accepts a patch factory: (req, room) => patch object.
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

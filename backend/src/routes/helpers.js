/**
 * Shared helpers for Express route handlers.
 */

import { safeRoom, makeSnapshot, pushUndo, pushLog } from '../roomUtils.js';
import { withRetry } from '../db/transaction.js';
import { getRepository, VersionConflictError } from '../db/index.js';
import { ERRORS } from '../errors.js';

export const db = getRepository();

// ── Request helpers ───────────────────────────────────────────────────────────

export function hostToken(req) {
  return req.headers['x-host-token'] || req.body?.hostToken || '';
}

// ── Request logging ───────────────────────────────────────────────────────────

export function logRequest(method, path, status) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), method, path, status }));
}

// ── Command executor ──────────────────────────────────────────────────────────

export async function runCommand(code, command, room, expectedVersion, res) {
  const snapshot     = makeSnapshot(room);
  const { patch, logEntry } = command.execute(room);
  const undoStack    = pushUndo(room, snapshot);
  const operationLog = pushLog(room, logEntry);

  try {
    const updated = await withRetry(() =>
      db.saveState(code, { ...patch, undoStack, operationLog }, expectedVersion)
    );
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return res.status(409).json({ error: ERRORS.VERSION_CONFLICT });
    }
    throw e;
  }
}

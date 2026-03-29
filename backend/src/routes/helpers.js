/**
 * Lambda-specific request/response helpers shared across route modules.
 */

import { corsHeaders } from '../config.js';
import { safeRoom, makeSnapshot, pushUndo, pushLog } from '../roomUtils.js';
import { withRetry } from '../db/transaction.js';
import { getRepository, VersionConflictError } from '../db/index.js';

export const db = getRepository();

// ── Response helpers ──────────────────────────────────────────────────────────

export function jsonResponse(stream, statusCode, body) {
  // eslint-disable-next-line no-undef
  const s = awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
  s.write(JSON.stringify(body));
  s.end();
}

export function err(stream, statusCode, message) {
  jsonResponse(stream, statusCode, { error: message });
}

// ── Request helpers ───────────────────────────────────────────────────────────

export function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

export function hostToken(event) {
  return event.headers?.['x-host-token'] || parseBody(event).hostToken || '';
}

// ── Request logging ───────────────────────────────────────────────────────────

export function logRequest(method, path, status) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), method, path, status }));
}

// ── Command executor ──────────────────────────────────────────────────────────

export async function runCommand(code, command, room, expectedVersion, stream) {
  const snapshot     = makeSnapshot(room);
  const { patch, logEntry } = command.execute(room);
  const undoStack    = pushUndo(room, snapshot);
  const operationLog = pushLog(room, logEntry);

  try {
    const updated = await withRetry(() =>
      db.saveState(code, { ...patch, undoStack, operationLog }, expectedVersion)
    );
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) {
      return err(stream, 409, 'Version conflict — reload and retry');
    }
    throw e;
  }
}

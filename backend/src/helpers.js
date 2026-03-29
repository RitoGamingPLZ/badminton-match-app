/**
 * Shared helpers used by service modules and the Lambda handler.
 */

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

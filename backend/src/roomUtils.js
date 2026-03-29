/**
 * Room serialisation and undo/log stack helpers.
 *
 * These utilities are shared across route handlers.
 * They have no side-effects and never touch
 * the database directly.
 */

import { MAX_UNDO, MAX_LOG } from './config.js';

// ── Room serialisation ────────────────────────────────────────────────────────

/** Strip internal fields before sending to clients. */
export function safeRoom(room) {
  return {
    code:               room.code,
    version:            room.version,
    format:             room.format,
    started:            room.started,
    players:            room.players.map(p => ({ name: p.name, gamesPlayed: p.gamesPlayed })),
    matches:            room.matches,
    currentMatchIndex:  room.currentMatchIndex,
    operationLog:       room.operationLog       || [],
    unavailablePlayers: room.unavailablePlayers || [],
    canUndo:            (room.undoStack         || []).length > 0,
  };
}

// ── Undo / log stack helpers ──────────────────────────────────────────────────

export function pushUndo(room, snapshot) {
  return [...(room.undoStack || []), snapshot].slice(-MAX_UNDO);
}

export function pushLog(room, entry) {
  return [...(room.operationLog || []), { ...entry, ts: new Date().toISOString() }].slice(-MAX_LOG);
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/** Captures all fields that commands may mutate (used for undo). */
export function makeSnapshot(room) {
  return {
    matches:            room.matches,
    players:            room.players,
    currentMatchIndex:  room.currentMatchIndex,
    unavailablePlayers: room.unavailablePlayers || [],
  };
}

/** Required keys in a valid undo snapshot. */
const SNAPSHOT_FIELDS = ['matches', 'players', 'currentMatchIndex', 'unavailablePlayers'];

/** Returns true when the snapshot has all required fields. */
export function isValidSnapshot(snapshot) {
  return snapshot != null && SNAPSHOT_FIELDS.every(f => snapshot[f] !== undefined);
}

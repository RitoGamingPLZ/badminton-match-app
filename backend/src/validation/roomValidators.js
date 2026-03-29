/**
 * Validators that check room state.
 * Each returns { status, error } on failure, or null on success.
 */

import { ERRORS } from '../errors.js';

export function validateRoomExists(room) {
  if (!room) return { status: 404, error: ERRORS.ROOM_NOT_FOUND };
  return null;
}

export function validateIsHost(req, room) {
  const token = req.headers['x-host-token'] || req.body?.hostToken || '';
  if (room.hostToken !== token) return { status: 403, error: ERRORS.NOT_HOST };
  return null;
}

export function validateSessionStarted(room) {
  if (!room.started) return { status: 409, error: ERRORS.SESSION_NOT_STARTED };
  return null;
}

export function validateSessionNotStarted(room) {
  if (room.started) return { status: 409, error: ERRORS.SESSION_STARTED };
  return null;
}

export function validateMinPlayers(room) {
  if (room.players.length < 4) return { status: 400, error: ERRORS.MIN_PLAYERS };
  return null;
}

export function validateActiveMatch(room) {
  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return { status: 409, error: ERRORS.NO_ACTIVE_MATCH };
  return null;
}

export function validateUndoAvailable(room) {
  if (!(room.undoStack || []).length) return { status: 409, error: ERRORS.NOTHING_TO_UNDO };
  return null;
}

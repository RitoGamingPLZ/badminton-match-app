/**
 * Room-state validators — take plain values and throw ServiceError on failure.
 * Services call these before executing any business logic.
 */

import { ServiceError } from '../errors.js';
import { ERRORS } from '../errors.js';

export function validateRoomExists(room) {
  if (!room) throw new ServiceError(404, ERRORS.ROOM_NOT_FOUND);
}

export function validateIsHost(token, room) {
  if (room.hostToken !== token) throw new ServiceError(403, ERRORS.NOT_HOST);
}

export function validateSessionStarted(room) {
  if (!room.started) throw new ServiceError(409, ERRORS.SESSION_NOT_STARTED);
}

export function validateSessionNotStarted(room) {
  if (room.started) throw new ServiceError(409, ERRORS.SESSION_STARTED);
}

export function validateMinPlayers(room) {
  if (room.players.length < 4) throw new ServiceError(400, ERRORS.MIN_PLAYERS);
}

export function validateActiveMatch(room) {
  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') throw new ServiceError(409, ERRORS.NO_ACTIVE_MATCH);
}

export function validateUndoAvailable(room) {
  if (!(room.undoStack || []).length) throw new ServiceError(409, ERRORS.NOTHING_TO_UNDO);
}

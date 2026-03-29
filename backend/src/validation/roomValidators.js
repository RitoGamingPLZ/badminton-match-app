/**
 * Validators that check room state.
 * Each returns { status, error } on failure, or null on success.
 */

export function validateRoomExists(room) {
  if (!room) return { status: 404, error: 'Room not found' };
  return null;
}

export function validateIsHost(req, room) {
  const token = req.headers['x-host-token'] || req.body?.hostToken || '';
  if (room.hostToken !== token) return { status: 403, error: 'Not the host' };
  return null;
}

export function validateSessionStarted(room) {
  if (!room.started) return { status: 409, error: 'Session not started' };
  return null;
}

export function validateSessionNotStarted(room) {
  if (room.started) return { status: 409, error: 'Session already started' };
  return null;
}

export function validateMinPlayers(room) {
  if (room.players.length < 4) return { status: 400, error: 'Need at least 4 players for doubles' };
  return null;
}

export function validateActiveMatch(room) {
  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return { status: 409, error: 'No active match' };
  return null;
}

export function validateUndoAvailable(room) {
  if (!(room.undoStack || []).length) return { status: 409, error: 'Nothing to undo' };
  return null;
}

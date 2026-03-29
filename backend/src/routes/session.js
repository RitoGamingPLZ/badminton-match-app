/**
 * Session control handlers: undo.
 */

import { VersionConflictError } from '../db/index.js';
import { safeRoom } from '../helpers.js';
import { db, jsonResponse, err, parseBody, hostToken } from './helpers.js';

export async function handleUndoLastOperation(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const undoStack = room.undoStack || [];
  if (!undoStack.length) return err(stream, 409, 'Nothing to undo');

  const snapshot     = undoStack[undoStack.length - 1];
  const newUndoStack = undoStack.slice(0, -1);
  const operationLog = (room.operationLog || []).slice(0, -1);

  try {
    const updated = await db.saveState(code, {
      matches:            snapshot.matches,
      players:            snapshot.players,
      currentMatchIndex:  snapshot.currentMatchIndex,
      unavailablePlayers: snapshot.unavailablePlayers ?? [],
      undoStack:          newUndoStack,
      operationLog,
    }, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

/**
 * Session control handlers: undo.
 */

import { VersionConflictError } from '../db/index.js';
import { safeRoom, isValidSnapshot } from '../roomUtils.js';
import { ERRORS } from '../errors.js';
import { db, jsonResponse, err, parseBody, hostToken } from './helpers.js';

export async function handleUndoLastOperation(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.hostToken !== hostToken(event)) return err(stream, 403, ERRORS.NOT_HOST);
  if (!room.started) return err(stream, 409, ERRORS.SESSION_NOT_STARTED);

  const undoStack = room.undoStack || [];
  if (!undoStack.length) return err(stream, 409, ERRORS.NOTHING_TO_UNDO);

  const snapshot = undoStack[undoStack.length - 1];
  if (!isValidSnapshot(snapshot)) return err(stream, 500, ERRORS.CORRUPT_UNDO_SNAPSHOT);

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
    if (e instanceof VersionConflictError) return err(stream, 409, ERRORS.VERSION_CONFLICT);
    throw e;
  }
}

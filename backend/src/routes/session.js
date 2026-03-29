/**
 * Session control handlers: undo.
 */

import { VersionConflictError } from '../db/index.js';
import { safeRoom, isValidSnapshot } from '../roomUtils.js';
import { ERRORS } from '../errors.js';
import { db, hostToken } from './helpers.js';

export async function handleUndoLastOperation(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: ERRORS.NOT_HOST });
  if (!room.started) return res.status(409).json({ error: ERRORS.SESSION_NOT_STARTED });

  const undoStack = room.undoStack || [];
  if (!undoStack.length) return res.status(409).json({ error: ERRORS.NOTHING_TO_UNDO });

  const snapshot = undoStack[undoStack.length - 1];
  if (!isValidSnapshot(snapshot)) return res.status(500).json({ error: ERRORS.CORRUPT_UNDO_SNAPSHOT });

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
    }, req.body?.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: ERRORS.VERSION_CONFLICT });
    throw e;
  }
}

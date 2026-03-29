/**
 * Session management service functions.
 *
 * Handles: undoLastOperation, sseEvents
 * Each function is an Express (req, res) handler.
 */

import { getRepository, VersionConflictError } from '../db/index.js';
import { safeRoom } from '../helpers.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionStarted,
  validateUndoAvailable,
} from '../validation/index.js';

const db = getRepository();

const SSE_MAX_MS  = 10 * 60 * 1000;
const SSE_POLL_MS = 2000;
const SSE_PING_MS = 30 * 1000;

export async function undoLastOperation(req, res) {
  const { code } = req.params;
  const room     = await db.getRoom(code);

  const invalid =
    validateRoomExists(room)     ||
    validateIsHost(req, room)    ||
    validateSessionStarted(room) ||
    validateUndoAvailable(room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const undoStack    = room.undoStack;
  const snapshot     = undoStack[undoStack.length - 1];
  const newUndoStack = undoStack.slice(0, -1);
  const operationLog = (room.operationLog || []).slice(0, -1);

  try {
    const updated = await db.saveState(code, {
      matches:             snapshot.matches,
      players:             snapshot.players,
      currentMatchIndex:   snapshot.currentMatchIndex,
      unavailablePlayers:  snapshot.unavailablePlayers ?? [],
      undoStack:           newUndoStack,
      operationLog,
    }, req.body.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError)
      return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
}

export async function sseEvents(req, res) {
  const { code } = req.params;
  let clientVersion = parseInt(req.query.version ?? '0', 10);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const write = data => { try { res.write(data); } catch { /* client disconnected */ } };
  write(`: connected to room ${code}\n\n`);

  const startTime = Date.now();
  let lastPing    = startTime;

  try {
    while (Date.now() - startTime < SSE_MAX_MS) {
      if (res.destroyed) break;

      const room = await db.getRoom(code);
      if (!room) { write('event: error\ndata: {"message":"Room not found"}\n\n'); break; }

      if (room.version > clientVersion) {
        clientVersion = room.version;
        write(`data: ${JSON.stringify(safeRoom(room))}\n\n`);
      }

      const now = Date.now();
      if (now - lastPing >= SSE_PING_MS) { write(': ping\n\n'); lastPing = now; }

      await new Promise(resolve => setTimeout(resolve, SSE_POLL_MS));
    }
  } catch (error) {
    write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
  }

  write('event: close\ndata: {}\n\n');
  res.end();
}

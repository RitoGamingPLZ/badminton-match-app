/**
 * SessionService — undo and real-time room watching.
 *
 * Owns: undo, watchRoom (async generator consumed by the SSE route).
 */

import { safeRoom, isValidSnapshot } from '../roomUtils.js';
import { ServiceError, ERRORS } from '../errors.js';
import { withRetry, withConflictRetry, sleep } from '../db/transaction.js';
import {
  validateRoomExists,
  validateSessionStarted,
  validateUndoAvailable,
} from '../validation/roomValidators.js';

const SSE_MAX_MS  = 10 * 60 * 1000;
const SSE_POLL_MS = 2000;
const SSE_PING_MS = 30 * 1000;

export class SessionService {
  #db;

  constructor(db) {
    this.#db = db;
  }

  async undo(code, token, version) {
    const room = await withRetry(() => this.#db.getRoom(code));
    validateRoomExists(room);
    validateSessionStarted(room);
    validateUndoAvailable(room);

    const undoStack = room.undoStack || [];
    const snapshot  = undoStack[undoStack.length - 1];
    if (!isValidSnapshot(snapshot))
      throw new ServiceError(500, ERRORS.CORRUPT_UNDO_SNAPSHOT);

    const patch = {
      matches:            snapshot.matches,
      players:            snapshot.players,
      currentMatchIndex:  snapshot.currentMatchIndex,
      unavailablePlayers: snapshot.unavailablePlayers ?? [],
      undoStack:          undoStack.slice(0, -1),
      operationLog:       (room.operationLog || []).slice(0, -1),
    };

    return withConflictRetry(
      () => withRetry(() => this.#db.saveState(code, patch, version ?? room.version))
              .then(updated => ({ room: safeRoom(updated) })),
      async () => { version = (await withRetry(() => this.#db.getRoom(code)))?.version; },
    );
  }

  /**
   * Async generator that polls the DB and yields SSE event descriptors.
   * Consumed by the SSE route handler which owns the HTTP transport.
   *
   * Yields objects of the form:
   *   { type: 'data',  room }    — room state changed
   *   { type: 'ping' }           — keepalive
   *   { type: 'error', message } — room not found / unrecoverable error
   *   { type: 'close' }          — max lifetime reached or client gone
   */
  async *watchRoom(code, startVersion) {
    let clientVersion = startVersion;
    const startTime   = Date.now();
    let lastPing      = startTime;

    while (Date.now() - startTime < SSE_MAX_MS) {
      const room = await withRetry(() => this.#db.getRoom(code));
      if (!room) { yield { type: 'error', message: 'Room not found' }; return; }

      if (room.version > clientVersion) {
        clientVersion = room.version;
        yield { type: 'data', room: safeRoom(room) };
      }

      const now = Date.now();
      if (now - lastPing >= SSE_PING_MS) { yield { type: 'ping' }; lastPing = now; }

      await sleep(SSE_POLL_MS);
    }

    yield { type: 'close' };
  }
}

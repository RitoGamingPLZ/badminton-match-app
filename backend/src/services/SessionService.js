/**
 * SessionService — undo and real-time room watching.
 *
 * Owns: undo, watchRoom (async generator consumed by the SSE route).
 */

import { safeRoom, isValidSnapshot } from '../roomUtils.js';
import { ServiceError, ERRORS } from '../errors.js';
import { VersionConflictError } from '../db/index.js';
import { withRetry, sleep } from '../db/transaction.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionStarted,
  validateUndoAvailable,
} from '../validation/roomValidators.js';

const TRANSACTION_DELAYS_MS = [300, 600, 900];

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
    validateIsHost(token, room);
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

    for (let attempt = 0; attempt < TRANSACTION_DELAYS_MS.length; attempt++) {
      try {
        const updated = await withRetry(() =>
          this.#db.saveState(code, patch, version ?? room.version)
        );
        return { room: safeRoom(updated) };
      } catch (e) {
        if (!(e instanceof VersionConflictError)) throw e;
        if (attempt === TRANSACTION_DELAYS_MS.length - 1)
          throw new ServiceError(409, ERRORS.VERSION_CONFLICT);
        await sleep(TRANSACTION_DELAYS_MS[attempt]);
        version = (await withRetry(() => this.#db.getRoom(code)))?.version;
      }
    }
  }

  /**
   * Async generator that polls the DB and yields SSE event descriptors.
   * Consumed by the SSE route handler which owns the HTTP transport.
   *
   * Yields objects of the form:
   *   { type: 'data',  room }   — room state changed
   *   { type: 'ping' }          — keepalive
   *   { type: 'error', message} — room not found / unrecoverable error
   *   { type: 'close' }         — max lifetime reached or client gone
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

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../services/RoomService.js';
import { MatchService } from '../services/MatchService.js';
import { SessionService } from '../services/SessionService.js';
import { InMemoryRepository } from '../db/InMemoryRepository.js';
import { ServiceError } from '../errors.js';

function assertServiceError(fn, status) {
  return assert.rejects(fn, (err) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.status, status);
    return true;
  });
}

// Build a started room with one match already marked done (to populate undoStack)
async function setupWithUndo() {
  const db           = new InMemoryRepository();
  const roomService  = new RoomService(db);
  const matchService = new MatchService(db);
  const sessionService = new SessionService(db);

  const { hostToken, room: created } = await roomService.createRoom({
    playerName: 'Alice',
    additionalPlayers: ['Bob', 'Carol', 'Dave'],
  });
  const { room: started } = await roomService.startSession(created.code, hostToken, created.version);
  await matchService.markDone(created.code, hostToken, 1, started.version);
  const { room: current } = await roomService.getRoom(created.code);

  return { db, sessionService, roomService, hostToken, code: created.code, room: current };
}

describe('SessionService.undo', () => {
  test('restores room to pre-markDone state', async () => {
    const { sessionService, hostToken, code, room } = await setupWithUndo();
    assert.equal(room.currentMatchIndex, 1);

    const { room: undone } = await sessionService.undo(code, hostToken, room.version);
    assert.equal(undone.currentMatchIndex, 0);
    assert.equal(undone.matches[0].status, 'active');
  });

  test('canUndo becomes false after undoing the only operation', async () => {
    const { sessionService, hostToken, code, room } = await setupWithUndo();
    const { room: undone } = await sessionService.undo(code, hostToken, room.version);
    assert.equal(undone.canUndo, false);
  });

  test('throws 409 when there is nothing to undo', async () => {
    const db = new InMemoryRepository();
    const roomService  = new RoomService(db);
    const sessionService = new SessionService(db);

    const { hostToken, room: created } = await roomService.createRoom({
      playerName: 'Alice',
      additionalPlayers: ['Bob', 'Carol', 'Dave'],
    });
    const { room: started } = await roomService.startSession(created.code, hostToken, created.version);

    await assertServiceError(() => sessionService.undo(created.code, hostToken, started.version), 409);
  });

  test('throws 404 for non-existent room', async () => {
    const db = new InMemoryRepository();
    const sessionService = new SessionService(db);
    await assertServiceError(() => sessionService.undo('0000', 'any', 1), 404);
  });
});

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../services/RoomService.js';
import { InMemoryRepository } from '../db/InMemoryRepository.js';
import { ServiceError } from '../errors.js';

function assertServiceError(fn, status) {
  return assert.rejects(fn, (err) => {
    assert.ok(err instanceof ServiceError, `Expected ServiceError, got ${err}`);
    assert.equal(err.status, status);
    return true;
  });
}

let db, service;

beforeEach(() => {
  db = new InMemoryRepository();
  service = new RoomService(db);
});

describe('RoomService.createRoom', () => {
  test('creates a room and returns hostToken + safe room', async () => {
    const { hostToken, room } = await service.createRoom({ playerName: 'Alice' });
    assert.ok(typeof hostToken === 'string' && hostToken.length > 0);
    assert.equal(room.started, false);
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].name, 'Alice');
    assert.ok(/^\d{4}$/.test(room.code));
  });

  test('deduplicates additionalPlayers', async () => {
    const { room } = await service.createRoom({
      playerName: 'Alice',
      additionalPlayers: ['Bob', 'Alice', 'bob'],
    });
    assert.equal(room.players.length, 2); // Alice + Bob only
  });

  test('throws 400 for missing player name', async () => {
    await assertServiceError(() => service.createRoom({ playerName: '' }), 400);
  });

  test('hostToken is not exposed in safe room', async () => {
    const { room } = await service.createRoom({ playerName: 'Alice' });
    assert.equal(room.hostToken, undefined);
  });
});

describe('RoomService.joinRoom', () => {
  test('adds a player to an existing room', async () => {
    const { room: created } = await service.createRoom({ playerName: 'Alice' });
    const { room } = await service.joinRoom(created.code, 'Bob');
    assert.equal(room.players.length, 2);
    assert.ok(room.players.some(p => p.name === 'Bob'));
  });

  test('throws 409 for duplicate name (case-insensitive)', async () => {
    const { room } = await service.createRoom({ playerName: 'Alice' });
    await assertServiceError(() => service.joinRoom(room.code, 'alice'), 409);
  });

  test('throws 404 for non-existent room', async () => {
    await assertServiceError(() => service.joinRoom('9999', 'Bob'), 404);
  });

  test('throws 409 when session already started', async () => {
    const { hostToken, room } = await service.createRoom({
      playerName: 'A',
      additionalPlayers: ['B', 'C', 'D'],
    });
    await service.startSession(room.code, hostToken, room.version);
    await assertServiceError(() => service.joinRoom(room.code, 'E'), 409);
  });
});

describe('RoomService.getRoom', () => {
  test('returns safe room for existing room', async () => {
    const { room: created } = await service.createRoom({ playerName: 'Alice' });
    const { room } = await service.getRoom(created.code);
    assert.equal(room.code, created.code);
  });

  test('throws 404 for unknown code', async () => {
    await assertServiceError(() => service.getRoom('0000'), 404);
  });
});

describe('RoomService.startSession', () => {
  async function createReadyRoom() {
    const { hostToken, room } = await service.createRoom({
      playerName: 'Alice',
      additionalPlayers: ['Bob', 'Carol', 'Dave'],
    });
    return { hostToken, room };
  }

  test('starts session and generates matches', async () => {
    const { hostToken, room } = await createReadyRoom();
    const { room: started } = await service.startSession(room.code, hostToken, room.version);
    assert.equal(started.started, true);
    assert.ok(started.matches.length > 0);
    assert.equal(started.matches[0].status, 'active');
  });

  test('throws 403 for wrong host token', async () => {
    const { room } = await createReadyRoom();
    await assertServiceError(() => service.startSession(room.code, 'bad-token', room.version), 403);
  });

  test('throws 400 when fewer than 4 players', async () => {
    const { hostToken, room } = await service.createRoom({ playerName: 'Alice' });
    await assertServiceError(() => service.startSession(room.code, hostToken, room.version), 400);
  });

  test('throws 409 when session already started', async () => {
    const { hostToken, room } = await createReadyRoom();
    await service.startSession(room.code, hostToken, room.version);
    const { room: r2 } = await service.getRoom(room.code);
    await assertServiceError(() => service.startSession(room.code, hostToken, r2.version), 409);
  });
});

describe('RoomService.addMatches', () => {
  test('appends matches after session starts', async () => {
    const { hostToken, room } = await service.createRoom({
      playerName: 'Alice',
      additionalPlayers: ['Bob', 'Carol', 'Dave'],
    });
    const { room: started } = await service.startSession(room.code, hostToken, room.version);
    const before = started.matches.length;
    const { room: updated } = await service.addMatches(room.code, hostToken, 3, started.version);
    assert.ok(updated.matches.length > before);
  });

  test('throws 403 for wrong host token', async () => {
    const { hostToken, room } = await service.createRoom({
      playerName: 'Alice',
      additionalPlayers: ['Bob', 'Carol', 'Dave'],
    });
    await service.startSession(room.code, hostToken, room.version);
    await assertServiceError(() => service.addMatches(room.code, 'wrong', 3), 403);
  });
});

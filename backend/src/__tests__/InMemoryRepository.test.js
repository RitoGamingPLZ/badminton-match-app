import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../db/InMemoryRepository.js';
import { VersionConflictError } from '../db/errors.js';

const makeRoom = (code = '1234') => ({
  code,
  hostToken: 'token',
  format: 'doubles',
  started: false,
  players: [{ name: 'Alice', gamesPlayed: 0 }],
  matches: [],
  currentMatchIndex: 0,
  undoStack: [],
  operationLog: [],
  unavailablePlayers: [],
});

describe('VersionConflictError', () => {
  test('is an Error with correct name', () => {
    const err = new VersionConflictError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'VersionConflictError');
    assert.ok(err.message.includes('Version conflict'));
  });
});

describe('InMemoryRepository.createRoom / getRoom', () => {
  let db;
  beforeEach(() => { db = new InMemoryRepository(); });

  test('createRoom sets version=1 and a future ttl', async () => {
    const created = await db.createRoom(makeRoom());
    assert.equal(created.version, 1);
    assert.ok(created.ttl > Date.now());
  });

  test('getRoom returns a clone of the stored room', async () => {
    await db.createRoom(makeRoom());
    const got = await db.getRoom('1234');
    assert.equal(got.code, '1234');
    assert.equal(got.version, 1);
  });

  test('getRoom returns null for unknown code', async () => {
    const got = await db.getRoom('9999');
    assert.equal(got, null);
  });

  test('getRoom returns independent clone (mutation does not affect store)', async () => {
    await db.createRoom(makeRoom());
    const got = await db.getRoom('1234');
    got.players.push({ name: 'Mutated' });
    const got2 = await db.getRoom('1234');
    assert.equal(got2.players.length, 1); // store unchanged
  });
});

describe('InMemoryRepository.addPlayer', () => {
  let db;
  beforeEach(async () => {
    db = new InMemoryRepository();
    await db.createRoom(makeRoom());
  });

  test('appends player and increments version', async () => {
    const updated = await db.addPlayer('1234', { name: 'Bob', gamesPlayed: 0 }, 1);
    assert.equal(updated.players.length, 2);
    assert.equal(updated.players[1].name, 'Bob');
    assert.equal(updated.version, 2);
  });

  test('throws VersionConflictError for wrong version', async () => {
    await assert.rejects(
      () => db.addPlayer('1234', { name: 'Bob', gamesPlayed: 0 }, 99),
      (err) => { assert.ok(err instanceof VersionConflictError); return true; },
    );
  });
});

describe('InMemoryRepository.startSession', () => {
  let db;
  beforeEach(async () => {
    db = new InMemoryRepository();
    await db.createRoom(makeRoom());
  });

  test('sets matches, currentMatchIndex=0, started=true and increments version', async () => {
    const matches = [{ id: 1, status: 'active' }];
    const updated = await db.startSession('1234', matches, 1);
    assert.deepEqual(updated.matches, matches);
    assert.equal(updated.currentMatchIndex, 0);
    assert.equal(updated.started, true);
    assert.equal(updated.version, 2);
  });

  test('throws VersionConflictError for wrong version', async () => {
    await assert.rejects(
      () => db.startSession('1234', [], 99),
      (err) => { assert.ok(err instanceof VersionConflictError); return true; },
    );
  });
});

describe('InMemoryRepository.appendMatches', () => {
  let db;
  beforeEach(async () => {
    db = new InMemoryRepository();
    await db.createRoom(makeRoom());
    await db.startSession('1234', [{ id: 1 }], 1);
  });

  test('appends new matches and increments version', async () => {
    const updated = await db.appendMatches('1234', [{ id: 2 }, { id: 3 }], 2);
    assert.equal(updated.matches.length, 3);
    assert.equal(updated.version, 3);
  });

  test('throws VersionConflictError for wrong version', async () => {
    await assert.rejects(
      () => db.appendMatches('1234', [], 99),
      (err) => { assert.ok(err instanceof VersionConflictError); return true; },
    );
  });
});

describe('InMemoryRepository.saveState', () => {
  let db;
  beforeEach(async () => {
    db = new InMemoryRepository();
    await db.createRoom(makeRoom());
  });

  test('applies patch fields and increments version', async () => {
    const updated = await db.saveState('1234', { currentMatchIndex: 5 }, 1);
    assert.equal(updated.currentMatchIndex, 5);
    assert.equal(updated.version, 2);
  });

  test('only applies known patch fields', async () => {
    const updated = await db.saveState('1234', { code: 'evil', currentMatchIndex: 1 }, 1);
    assert.equal(updated.code, '1234'); // untouched
    assert.equal(updated.currentMatchIndex, 1);
  });

  test('throws VersionConflictError for version mismatch', async () => {
    await assert.rejects(
      () => db.saveState('1234', { currentMatchIndex: 1 }, 99),
      (err) => { assert.ok(err instanceof VersionConflictError); return true; },
    );
  });
});

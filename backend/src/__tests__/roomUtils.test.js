import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { safeRoom, pushUndo, pushLog, makeSnapshot, isValidSnapshot } from '../roomUtils.js';

const baseRoom = {
  code: '1234',
  version: 2,
  format: 'doubles',
  started: true,
  players: [{ name: 'Alice', gamesPlayed: 3, _internal: 'x' }],
  matches: [],
  currentMatchIndex: 0,
  operationLog: [],
  unavailablePlayers: [],
  undoStack: [],
  hostToken: 'secret',
  ttl: Date.now() + 9999,
};

describe('safeRoom', () => {
  test('returns only public fields', () => {
    const safe = safeRoom(baseRoom);
    assert.equal(safe.code, '1234');
    assert.equal(safe.version, 2);
    assert.equal(safe.format, 'doubles');
    assert.equal(safe.started, true);
    assert.equal(safe.currentMatchIndex, 0);
  });

  test('strips hostToken and ttl', () => {
    const safe = safeRoom(baseRoom);
    assert.equal(safe.hostToken, undefined);
    assert.equal(safe.ttl, undefined);
  });

  test('strips internal player fields', () => {
    const safe = safeRoom(baseRoom);
    assert.equal(safe.players[0]._internal, undefined);
    assert.equal(safe.players[0].name, 'Alice');
    assert.equal(safe.players[0].gamesPlayed, 3);
  });

  test('canUndo is true when undoStack has entries', () => {
    const room = { ...baseRoom, undoStack: [{}] };
    assert.equal(safeRoom(room).canUndo, true);
  });

  test('canUndo is false when undoStack is empty', () => {
    assert.equal(safeRoom(baseRoom).canUndo, false);
  });

  test('operationLog and unavailablePlayers default to [] when absent', () => {
    const room = { ...baseRoom, operationLog: undefined, unavailablePlayers: undefined };
    const safe = safeRoom(room);
    assert.deepEqual(safe.operationLog, []);
    assert.deepEqual(safe.unavailablePlayers, []);
  });
});

describe('pushUndo', () => {
  test('appends snapshot to stack', () => {
    const room = { undoStack: [{ a: 1 }] };
    const result = pushUndo(room, { b: 2 });
    assert.equal(result.length, 2);
    assert.deepEqual(result[1], { b: 2 });
  });

  test('works when undoStack is absent', () => {
    const result = pushUndo({}, { x: 1 });
    assert.deepEqual(result, [{ x: 1 }]);
  });

  test('trims stack to MAX_UNDO (10)', () => {
    const room = { undoStack: Array(10).fill({ old: true }) };
    const result = pushUndo(room, { new: true });
    assert.equal(result.length, 10);
    assert.deepEqual(result[9], { new: true });
  });
});

describe('pushLog', () => {
  test('appends entry with a ts timestamp', () => {
    const room = { operationLog: [] };
    const result = pushLog(room, { type: 'test', description: 'x' });
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'test');
    assert.ok(typeof result[0].ts === 'string');
  });

  test('works when operationLog is absent', () => {
    const result = pushLog({}, { type: 'a' });
    assert.equal(result.length, 1);
  });

  test('trims log to MAX_LOG (50)', () => {
    const room = { operationLog: Array(50).fill({ type: 'old' }) };
    const result = pushLog(room, { type: 'new' });
    assert.equal(result.length, 50);
    assert.equal(result[49].type, 'new');
  });
});

describe('makeSnapshot', () => {
  test('captures the four mutable fields', () => {
    const room = {
      matches: [{ id: 1 }],
      players: [{ name: 'Alice', gamesPlayed: 0 }],
      currentMatchIndex: 2,
      unavailablePlayers: [{ name: 'Bob', availableFrom: 3 }],
    };
    const snap = makeSnapshot(room);
    assert.deepEqual(snap.matches, room.matches);
    assert.deepEqual(snap.players, room.players);
    assert.equal(snap.currentMatchIndex, 2);
    assert.deepEqual(snap.unavailablePlayers, room.unavailablePlayers);
  });

  test('defaults unavailablePlayers to [] when absent', () => {
    const room = { matches: [], players: [], currentMatchIndex: 0 };
    const snap = makeSnapshot(room);
    assert.deepEqual(snap.unavailablePlayers, []);
  });
});

describe('isValidSnapshot', () => {
  test('returns true for a valid snapshot', () => {
    assert.equal(
      isValidSnapshot({ matches: [], players: [], currentMatchIndex: 0, unavailablePlayers: [] }),
      true,
    );
  });

  test('returns false for null', () => {
    assert.equal(isValidSnapshot(null), false);
  });

  test('returns false when any required field is missing', () => {
    assert.equal(isValidSnapshot({ matches: [], players: [], currentMatchIndex: 0 }), false);
    assert.equal(isValidSnapshot({}), false);
  });
});

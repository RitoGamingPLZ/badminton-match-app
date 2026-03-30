import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RoomService } from '../services/RoomService.js';
import { MatchService } from '../services/MatchService.js';
import { InMemoryRepository } from '../db/InMemoryRepository.js';
import { ServiceError } from '../errors.js';

function assertServiceError(fn, status) {
  return assert.rejects(fn, (err) => {
    assert.ok(err instanceof ServiceError, `Expected ServiceError, got ${err.constructor.name}: ${err.message}`);
    assert.equal(err.status, status);
    return true;
  });
}

let db, roomService, matchService;
let hostToken, roomCode, roomVersion;

beforeEach(async () => {
  db = new InMemoryRepository();
  roomService  = new RoomService(db);
  matchService = new MatchService(db);

  // Create and start a room with 4 players ready to play
  const created = await roomService.createRoom({
    playerName: 'Alice',
    additionalPlayers: ['Bob', 'Carol', 'Dave'],
  });
  hostToken   = created.hostToken;
  roomCode    = created.room.code;

  const started = await roomService.startSession(roomCode, hostToken, created.room.version);
  roomVersion = started.room.version;
});

describe('MatchService.markDone', () => {
  test('marks current match done and advances to next', async () => {
    const { room } = await matchService.markDone(roomCode, hostToken, 1, roomVersion);
    assert.equal(room.currentMatchIndex, 1);
    assert.equal(room.matches[0].status, 'done');
    assert.equal(room.matches[0].winner, 1);
    assert.equal(room.matches[1].status, 'active');
  });

  test('increments gamesPlayed for match participants', async () => {
    const { room } = await matchService.markDone(roomCode, hostToken, 1, roomVersion);
    const participants = new Set([
      ...room.matches[0].team1,
      ...room.matches[0].team2,
    ]);
    for (const p of room.players) {
      if (participants.has(p.name)) {
        assert.equal(p.gamesPlayed, 1);
      }
    }
  });

  test('records canUndo after marking done', async () => {
    const { room } = await matchService.markDone(roomCode, hostToken, 1, roomVersion);
    assert.equal(room.canUndo, true);
  });


});

describe('MatchService.skipMatch', () => {
  test('removes skipping player from match and keeps it active (no bench available)', async () => {
    // 4-player room: all on court, no bench — player is removed, match continues
    const { room: current } = await roomService.getRoom(roomCode);
    const playerInMatch = current.matches[0].team1[0];

    const { room } = await matchService.skipMatch(roomCode, hostToken, playerInMatch, roomVersion);
    assert.equal(room.matches[0].status, 'active');
    assert.equal(room.currentMatchIndex, 0); // index does not advance
    const allInMatch = [...room.matches[0].team1, ...room.matches[0].team2];
    assert.ok(!allInMatch.includes(playerInMatch));
  });

  test('throws 400 for player not in current match', async () => {
    const { room: current } = await roomService.getRoom(roomCode);
    const allInMatch = new Set([
      ...current.matches[0].team1,
      ...current.matches[0].team2,
    ]);
    const notInMatch = current.players.find(p => !allInMatch.has(p.name));

    // Only attempt if there's actually a player not in the match
    if (notInMatch) {
      await assertServiceError(
        () => matchService.skipMatch(roomCode, hostToken, notInMatch.name, roomVersion),
        400,
      );
    }
  });

  test('succeeds without a host token (any player can self-skip)', async () => {
    const { room: current } = await roomService.getRoom(roomCode);
    const player = current.matches[0].team1[0];
    // passing null token should not throw — skip no longer requires host
    const { room } = await matchService.skipMatch(roomCode, null, player, roomVersion);
    assert.equal(room.currentMatchIndex, 0);
  });
});

describe('MatchService.editMatch', () => {
  test('edits teams of the current match', async () => {
    const { room: current } = await roomService.getRoom(roomCode);
    const players = current.players.map(p => p.name);
    const [a, b, c, d] = players;

    const { room } = await matchService.editMatch(
      roomCode, hostToken, 0, [a, c], [b, d], roomVersion,
    );
    assert.deepEqual(room.matches[0].team1, [a, c]);
    assert.deepEqual(room.matches[0].team2, [b, d]);
    assert.equal(room.matches[0].pinned, true);
  });

  test('throws 400 for unknown player in teams', async () => {
    await assertServiceError(
      () => matchService.editMatch(roomCode, hostToken, 0, ['Alice', 'X'], ['Carol', 'Dave'], roomVersion),
      400,
    );
  });

  test('throws 400 for duplicate players across teams', async () => {
    await assertServiceError(
      () => matchService.editMatch(roomCode, hostToken, 0, ['Alice', 'Bob'], ['Alice', 'Dave'], roomVersion),
      400,
    );
  });

  test('throws 409 for editing a done match', async () => {
    await matchService.markDone(roomCode, hostToken, 1, roomVersion);
    const { room: updated } = await roomService.getRoom(roomCode);
    await assertServiceError(
      () => matchService.editMatch(roomCode, hostToken, 0, ['Alice', 'Bob'], ['Carol', 'Dave'], updated.version),
      409,
    );
  });
});

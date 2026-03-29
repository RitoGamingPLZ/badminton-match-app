import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from '../commands/Command.js';
import { MatchDoneCommand } from '../commands/MatchDoneCommand.js';
import { SkipMatchCommand } from '../commands/SkipMatchCommand.js';
import { EditMatchCommand } from '../commands/EditMatchCommand.js';

// Minimal room fixture used by most command tests (4-player, 2 matches)
function makeRoom(overrides = {}) {
  return {
    currentMatchIndex: 0,
    matches: [
      { id: 1, team1: ['Alice', 'Bob'], team2: ['Carol', 'Dave'], format: 'doubles', status: 'active',  winner: null, pinned: false },
      { id: 2, team1: ['Alice', 'Carol'], team2: ['Bob', 'Dave'], format: 'doubles', status: 'pending', winner: null, pinned: false },
    ],
    players: [
      { name: 'Alice', gamesPlayed: 0 },
      { name: 'Bob',   gamesPlayed: 0 },
      { name: 'Carol', gamesPlayed: 0 },
      { name: 'Dave',  gamesPlayed: 0 },
    ],
    unavailablePlayers: [],
    ...overrides,
  };
}

describe('Command (base class)', () => {
  test('execute throws when not overridden', () => {
    const cmd = new Command();
    assert.throws(() => cmd.execute({}), /must implement execute/);
  });
});

describe('MatchDoneCommand', () => {
  test('marks current match as done with the given winner', () => {
    const { patch } = new MatchDoneCommand(1).execute(makeRoom());
    assert.equal(patch.matches[0].status, 'done');
    assert.equal(patch.matches[0].winner, 1);
  });

  test('advances currentMatchIndex by 1', () => {
    const { patch } = new MatchDoneCommand(1).execute(makeRoom());
    assert.equal(patch.currentMatchIndex, 1);
  });

  test('activates the next match', () => {
    const { patch } = new MatchDoneCommand(1).execute(makeRoom());
    assert.equal(patch.matches[1].status, 'active');
  });

  test('increments gamesPlayed for all 4 participants', () => {
    const { patch } = new MatchDoneCommand(1).execute(makeRoom());
    for (const p of patch.players) assert.equal(p.gamesPlayed, 1);
  });

  test('returns a match_done log entry with correct description', () => {
    const { logEntry } = new MatchDoneCommand(2).execute(makeRoom());
    assert.equal(logEntry.type, 'match_done');
    assert.ok(logEntry.description.includes('beat'));
    assert.equal(logEntry.matchNum, 1);
  });

  test('releases unavailable players whose period has ended', () => {
    const room = makeRoom({
      unavailablePlayers: [
        { name: 'Alice', availableFrom: 1 }, // availableFrom <= nextIdx(1) → released
        { name: 'Bob',   availableFrom: 3 }, // availableFrom > nextIdx(1)  → kept
      ],
    });
    const { patch } = new MatchDoneCommand(1).execute(room);
    assert.equal(patch.unavailablePlayers.length, 1);
    assert.equal(patch.unavailablePlayers[0].name, 'Bob');
  });

  test('winner=2 description names team2 as winner', () => {
    const { logEntry } = new MatchDoneCommand(2).execute(makeRoom());
    assert.ok(logEntry.description.includes('Carol'));
    assert.ok(logEntry.description.includes('Dave'));
  });
});

describe('SkipMatchCommand — no bench player', () => {
  // 4-player room: all on court, no bench available

  test('keeps match active (does not skip or advance index)', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(makeRoom());
    assert.equal(patch.matches[0].status, 'active');
    assert.equal(patch.currentMatchIndex, undefined); // index does not advance
  });

  test('removes skipping player from their team', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(makeRoom());
    assert.ok(!patch.matches[0].team1.includes('Alice'));
    assert.ok(!patch.matches[0].team2.includes('Alice'));
  });

  test('remaining players stay in their teams', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(makeRoom());
    // Bob was in team1 with Alice — he should still be there
    assert.ok(patch.matches[0].team1.includes('Bob') || patch.matches[0].team2.includes('Bob'));
  });

  test('adds skipping player to unavailable queue', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(makeRoom());
    assert.ok(patch.unavailablePlayers.some(p => p.name === 'Alice'));
  });

  test('returns a player_skipped log entry', () => {
    const { logEntry } = new SkipMatchCommand('Alice').execute(makeRoom());
    assert.equal(logEntry.type, 'player_skipped');
    assert.ok(logEntry.description.includes('Alice'));
  });
});

describe('SkipMatchCommand — bench player available', () => {
  // 5-player room: Eve is on bench (not in the active match)
  const roomWith5 = makeRoom({
    players: [
      { name: 'Alice', gamesPlayed: 0 },
      { name: 'Bob',   gamesPlayed: 0 },
      { name: 'Carol', gamesPlayed: 0 },
      { name: 'Dave',  gamesPlayed: 0 },
      { name: 'Eve',   gamesPlayed: 0 },
    ],
  });

  test('substitutes bench player and keeps match active (no index advance)', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(roomWith5);
    assert.equal(patch.matches[0].status, 'active');
    assert.equal(patch.currentMatchIndex, undefined); // no advancement
  });

  test('bench player appears in the regenerated match', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(roomWith5);
    const allInMatch = [...patch.matches[0].team1, ...patch.matches[0].team2];
    assert.ok(allInMatch.includes('Eve'), 'Eve should substitute in');
    assert.ok(!allInMatch.includes('Alice'), 'Alice should be removed');
  });

  test('adds skipping player to unavailable queue', () => {
    const { patch } = new SkipMatchCommand('Alice').execute(roomWith5);
    assert.ok(patch.unavailablePlayers.some(p => p.name === 'Alice'));
  });
});

describe('EditMatchCommand', () => {
  test('sets new teams on the specified match index', () => {
    const { patch } = new EditMatchCommand(0, ['Alice', 'Carol'], ['Bob', 'Dave']).execute(makeRoom());
    assert.deepEqual(patch.matches[0].team1, ['Alice', 'Carol']);
    assert.deepEqual(patch.matches[0].team2, ['Bob', 'Dave']);
  });

  test('pins the edited match', () => {
    const { patch } = new EditMatchCommand(0, ['Alice', 'Carol'], ['Bob', 'Dave']).execute(makeRoom());
    assert.equal(patch.matches[0].pinned, true);
  });

  test('returns a match_edited log entry', () => {
    const { logEntry } = new EditMatchCommand(0, ['Alice', 'Carol'], ['Bob', 'Dave']).execute(makeRoom());
    assert.equal(logEntry.type, 'match_edited');
    assert.equal(logEntry.matchNum, 1);
    assert.ok(logEntry.description.includes('edited'));
  });

  test('regenerates unpinned matches after the edited index', () => {
    const { patch } = new EditMatchCommand(0, ['Alice', 'Carol'], ['Bob', 'Dave']).execute(makeRoom());
    // Original match[1] should be replaced by regenerated match
    assert.ok(patch.matches.length >= 2);
    // Only the edited match at index 0 is pinned
    assert.equal(patch.matches[0].pinned, true);
  });
});

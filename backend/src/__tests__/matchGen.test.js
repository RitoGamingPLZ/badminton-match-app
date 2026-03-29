import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateMatches, calculateInitialRounds, regenerateUnpinnedMatches } from '../matchGen.js';

const players4 = [
  { name: 'Alice', gamesPlayed: 0 },
  { name: 'Bob',   gamesPlayed: 0 },
  { name: 'Carol', gamesPlayed: 0 },
  { name: 'Dave',  gamesPlayed: 0 },
];

describe('generateMatches', () => {
  test('returns empty array for fewer than 4 players', () => {
    assert.deepEqual(generateMatches([{ name: 'A', gamesPlayed: 0 }], 5), []);
    assert.deepEqual(generateMatches([], 5), []);
  });

  test('generates correct number of matches', () => {
    const matches = generateMatches(players4, 6);
    assert.equal(matches.length, 6);
  });

  test('each match has 2 players per team and correct shape', () => {
    for (const m of generateMatches(players4, 3)) {
      assert.equal(m.team1.length, 2);
      assert.equal(m.team2.length, 2);
      assert.equal(m.format, 'doubles');
      assert.equal(m.status, 'pending');
      assert.equal(m.winner, null);
      assert.equal(m.pinned, false);
    }
  });

  test('no duplicate players within a single match', () => {
    for (const m of generateMatches(players4, 5)) {
      const all = [...m.team1, ...m.team2];
      assert.equal(new Set(all).size, 4);
    }
  });

  test('ids start at startId and increment', () => {
    const matches = generateMatches(players4, 3, 10);
    assert.deepEqual(matches.map(m => m.id), [10, 11, 12]);
  });
});

describe('calculateInitialRounds', () => {
  test('returns at least 10 for small player counts', () => {
    assert.equal(calculateInitialRounds(4), 10);
    assert.equal(calculateInitialRounds(5), 10);
  });

  test('scales up for larger player counts', () => {
    assert.ok(calculateInitialRounds(8) > 10);
  });
});

describe('regenerateUnpinnedMatches', () => {
  test('returns empty array when no pending matches after index', () => {
    const matches = generateMatches(players4, 2);
    const result = regenerateUnpinnedMatches(matches, 1, players4);
    assert.deepEqual(result, []);
  });

  test('preserves pinned matches', () => {
    const matches = generateMatches(players4, 4);
    matches[1].pinned = true;
    const pinned = matches[1];
    const result = regenerateUnpinnedMatches(matches, 0, players4);
    const kept = result.find(m => m.team1[0] === pinned.team1[0] && m.team1[1] === pinned.team1[1]);
    assert.ok(kept, 'pinned match should be preserved');
  });

  test('result ids are sequential starting after afterIndex match id', () => {
    const matches = generateMatches(players4, 5);
    const result = regenerateUnpinnedMatches(matches, 1, players4);
    for (let i = 1; i < result.length; i++) {
      assert.equal(result[i].id, result[i - 1].id + 1);
    }
  });
});

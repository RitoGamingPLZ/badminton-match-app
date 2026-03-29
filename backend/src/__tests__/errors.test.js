import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceError,
  unknownPlayer,
  playerNotInMatch,
  matchNotFound,
} from '../errors.js';

describe('ServiceError', () => {
  test('stores status and message', () => {
    const err = new ServiceError(404, 'Not found');
    assert.ok(err instanceof Error);
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Not found');
  });
});

describe('error message helpers', () => {
  test('unknownPlayer returns correct string', () => {
    assert.equal(unknownPlayer('Alice'), 'Unknown player: Alice');
  });

  test('playerNotInMatch returns correct string', () => {
    assert.equal(playerNotInMatch('Bob'), 'Bob is not in the current match');
  });

  test('matchNotFound returns correct string', () => {
    assert.equal(matchNotFound(3), 'Match index 3 does not exist');
  });
});

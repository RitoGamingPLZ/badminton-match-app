import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePlayerName,
  validatePlayerNotTaken,
  validateWinner,
  validateTeams,
  validateTeamPlayers,
  validateMatchExists,
  validateMatchEditable,
} from '../validation/inputValidators.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionStarted,
  validateSessionNotStarted,
  validateMinPlayers,
  validateActiveMatch,
} from '../validation/roomValidators.js';
import { ServiceError, ERRORS } from '../errors.js';

// Helper to assert a specific ServiceError is thrown
function assertServiceError(fn, status, msgFragment) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.status, status);
    if (msgFragment) assert.ok(err.message.includes(msgFragment));
    return true;
  });
}

describe('validatePlayerName', () => {
  test('throws 400 for empty name', () => {
    assertServiceError(() => validatePlayerName(''), 400, 'required');
  });

  test('throws 400 for name exceeding max length', () => {
    assertServiceError(() => validatePlayerName('a'.repeat(51)), 400, 'characters');
  });

  test('passes for valid name', () => {
    assert.doesNotThrow(() => validatePlayerName('Alice'));
  });
});

describe('validatePlayerNotTaken', () => {
  const room = { players: [{ name: 'Alice' }] };

  test('throws 409 when name is taken (case-insensitive)', () => {
    assertServiceError(() => validatePlayerNotTaken('alice', room), 409);
    assertServiceError(() => validatePlayerNotTaken('ALICE', room), 409);
  });

  test('passes for new name', () => {
    assert.doesNotThrow(() => validatePlayerNotTaken('Bob', room));
  });
});

describe('validateWinner', () => {
  test('throws 400 for values other than 1 or 2', () => {
    assertServiceError(() => validateWinner(0), 400);
    assertServiceError(() => validateWinner(3), 400);
    assertServiceError(() => validateWinner(null), 400);
  });

  test('passes for 1 and 2', () => {
    assert.doesNotThrow(() => validateWinner(1));
    assert.doesNotThrow(() => validateWinner(2));
  });
});

describe('validateTeams', () => {
  test('throws 400 for invalid team1', () => {
    assertServiceError(() => validateTeams(['A'], ['B', 'C']), 400, 'team1');
    assertServiceError(() => validateTeams(null, ['B', 'C']), 400, 'team1');
  });

  test('throws 400 for invalid team2', () => {
    assertServiceError(() => validateTeams(['A', 'B'], ['C']), 400, 'team2');
  });

  test('passes for two 2-player teams', () => {
    assert.doesNotThrow(() => validateTeams(['A', 'B'], ['C', 'D']));
  });
});

describe('validateTeamPlayers', () => {
  const room = { players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] };

  test('throws 400 for unknown player', () => {
    assertServiceError(() => validateTeamPlayers(['A', 'X'], ['C', 'D'], room), 400, 'Unknown');
  });

  test('throws 400 for duplicate players across teams', () => {
    assertServiceError(() => validateTeamPlayers(['A', 'B'], ['A', 'D'], room), 400, 'Duplicate');
  });

  test('passes for valid, unique players', () => {
    assert.doesNotThrow(() => validateTeamPlayers(['A', 'B'], ['C', 'D'], room));
  });
});

describe('validateMatchExists', () => {
  const room = { matches: [{ id: 1 }] };

  test('throws 400 for out-of-bounds index', () => {
    assertServiceError(() => validateMatchExists(5, room), 400);
  });

  test('passes for valid index', () => {
    assert.doesNotThrow(() => validateMatchExists(0, room));
  });
});

describe('validateMatchEditable', () => {
  test('throws 409 for done or skipped match', () => {
    const room = { matches: [{ status: 'done' }, { status: 'skipped' }] };
    assertServiceError(() => validateMatchEditable(0, room), 409);
    assertServiceError(() => validateMatchEditable(1, room), 409);
  });

  test('passes for pending or active match', () => {
    const room = { matches: [{ status: 'pending' }, { status: 'active' }] };
    assert.doesNotThrow(() => validateMatchEditable(0, room));
    assert.doesNotThrow(() => validateMatchEditable(1, room));
  });
});

describe('validateRoomExists', () => {
  test('throws 404 for null room', () => {
    assertServiceError(() => validateRoomExists(null), 404, 'Room not found');
  });

  test('passes for existing room', () => {
    assert.doesNotThrow(() => validateRoomExists({ code: '1234' }));
  });
});

describe('validateIsHost', () => {
  const room = { hostToken: 'secret' };

  test('throws 403 for wrong token', () => {
    assertServiceError(() => validateIsHost('wrong', room), 403, 'Not the host');
  });

  test('passes for correct token', () => {
    assert.doesNotThrow(() => validateIsHost('secret', room));
  });
});

describe('validateMinPlayers', () => {
  test('throws 400 for fewer than 4 players', () => {
    assertServiceError(() => validateMinPlayers({ players: ['A', 'B', 'C'] }), 400);
  });

  test('passes for 4+ players', () => {
    assert.doesNotThrow(() => validateMinPlayers({ players: ['A', 'B', 'C', 'D'] }));
  });
});

describe('validateSessionStarted / validateSessionNotStarted', () => {
  test('validateSessionStarted throws 409 when not started', () => {
    assertServiceError(() => validateSessionStarted({ started: false }), 409);
  });

  test('validateSessionNotStarted throws 409 when already started', () => {
    assertServiceError(() => validateSessionNotStarted({ started: true }), 409);
  });
});

describe('validateActiveMatch', () => {
  test('throws 409 when no active match', () => {
    const room = { matches: [{ status: 'pending' }], currentMatchIndex: 0 };
    assertServiceError(() => validateActiveMatch(room), 409);
  });

  test('passes when current match is active', () => {
    const room = { matches: [{ status: 'active' }], currentMatchIndex: 0 };
    assert.doesNotThrow(() => validateActiveMatch(room));
  });
});

/**
 * Centralised error messages.
 *
 * Using constants instead of inline strings ensures error text is
 * consistent across route handlers and validators, and easy to update.
 *
 * Dynamic messages (where names/indices are embedded) are exported as
 * small helper functions alongside the constant map.
 */

import { MAX_PLAYER_NAME_LENGTH } from './config.js';

/**
 * Thrown by service methods when a business-rule violation occurs.
 * Route handlers pass these to next() so the Express error middleware
 * converts them to the appropriate HTTP response.
 */
export class ServiceError extends Error {
  /** @param {number} status  HTTP status code
   *  @param {string} message Error message sent to the client */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ERRORS = Object.freeze({
  PLAYER_NAME_REQUIRED:  'playerName is required',
  PLAYER_NAME_TOO_LONG:  `Player name must be ${MAX_PLAYER_NAME_LENGTH} characters or fewer`,
  PLAYER_NAME_TAKEN:     'Name already taken in this room',
  WINNER_INVALID:        'winner must be 1 or 2',
  TEAM1_INVALID:         'team1 must have 2 players',
  TEAM2_INVALID:         'team2 must have 2 players',
  DUPLICATE_PLAYERS:     'Duplicate players in teams',
  ROOM_NOT_FOUND:        'Room not found',
  NOT_HOST:              'Not the host',
  SESSION_STARTED:       'Session already started',
  SESSION_NOT_STARTED:   'Session not started',
  MIN_PLAYERS:           'Need at least 4 players for doubles',
  NO_ACTIVE_MATCH:       'No active match',
  NOTHING_TO_UNDO:       'Nothing to undo',
  VERSION_CONFLICT:      'Version conflict — reload and retry',
  MATCH_NOT_EDITABLE:    'Cannot edit a completed or skipped match',
  CORRUPT_UNDO_SNAPSHOT: 'Corrupt undo snapshot — cannot restore',
  ROOM_CODE_UNAVAILABLE: 'Could not generate unique room code',
});

/** `Unknown player: <name>` */
export const unknownPlayer    = name  => `Unknown player: ${name}`;

/** `<name> is not in the current match` */
export const playerNotInMatch = name  => `${name} is not in the current match`;

/** `Match index <index> does not exist` */
export const matchNotFound    = index => `Match index ${index} does not exist`;

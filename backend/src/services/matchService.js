/**
 * Match mutation service functions.
 *
 * Handles: markMatchDone, skipMatch, editMatch
 * Each function is an Express (req, res) handler.
 *
 * All mutations run inside withTransaction, which:
 *   - Re-reads the room on every attempt
 *   - Retries up to 3 times on version conflict (progressive 300/600/900 ms delay)
 *   - Retries DB calls up to 3 times on transient errors
 */

import { getRepository } from '../db/index.js';
import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { withTransaction } from '../helpers.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionStarted,
  validateActiveMatch,
  validateWinner,
  validatePlayerNameRequired,
  validatePlayerInMatch,
  validateTeams,
  validateTeamPlayers,
  validateMatchExists,
  validateMatchEditable,
} from '../validation/index.js';

const db = getRepository();

export function markMatchDone(req, res) {
  const { code } = req.params;

  return withTransaction(db, code, req, res,
    (req, room) =>
      validateRoomExists(room)     ||
      validateIsHost(req, room)    ||
      validateSessionStarted(room) ||
      validateWinner(req)          ||
      validateActiveMatch(room),
    (req) => new MatchDoneCommand(req.body.winner),
  );
}

export function skipMatch(req, res) {
  const { code } = req.params;

  return withTransaction(db, code, req, res,
    (req, room) =>
      validateRoomExists(room)                                   ||
      validateIsHost(req, room)                                  ||
      validateSessionStarted(room)                               ||
      validatePlayerNameRequired(req)                            ||
      validateActiveMatch(room)                                  ||
      validatePlayerInMatch(req.body.playerName?.trim(), room),
    (req) => new SkipMatchCommand(req.body.playerName.trim()),
  );
}

export function editMatch(req, res) {
  const { code } = req.params;

  return withTransaction(db, code, req, res,
    (req, room) => {
      const matchIndex = req.body.matchIndex ?? room.currentMatchIndex;
      return (
        validateRoomExists(room)                ||
        validateIsHost(req, room)               ||
        validateSessionStarted(room)            ||
        validateTeams(req)                      ||
        validateMatchExists(matchIndex, room)   ||
        validateMatchEditable(matchIndex, room) ||
        validateTeamPlayers(req, room)
      );
    },
    (req, room) => {
      const matchIndex = req.body.matchIndex ?? room.currentMatchIndex;
      return new EditMatchCommand(matchIndex, req.body.team1, req.body.team2);
    },
  );
}

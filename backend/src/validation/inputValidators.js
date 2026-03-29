/**
 * Input validators — take plain values and throw ServiceError on failure.
 * Services call these before executing any business logic.
 */

import { MAX_PLAYER_NAME_LENGTH } from '../config.js';
import { ServiceError, ERRORS, unknownPlayer, playerNotInMatch, matchNotFound } from '../errors.js';

export function validatePlayerName(name) {
  if (!name)                              throw new ServiceError(400, ERRORS.PLAYER_NAME_REQUIRED);
  if (name.length > MAX_PLAYER_NAME_LENGTH) throw new ServiceError(400, ERRORS.PLAYER_NAME_TOO_LONG);
}

export function validatePlayerNotTaken(name, room) {
  if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
    throw new ServiceError(409, ERRORS.PLAYER_NAME_TAKEN);
}

export function validateWinner(winner) {
  if (winner !== 1 && winner !== 2) throw new ServiceError(400, ERRORS.WINNER_INVALID);
}

export function validateTeams(team1, team2) {
  if (!Array.isArray(team1) || team1.length !== 2) throw new ServiceError(400, ERRORS.TEAM1_INVALID);
  if (!Array.isArray(team2) || team2.length !== 2) throw new ServiceError(400, ERRORS.TEAM2_INVALID);
}

export function validateTeamPlayers(team1, team2, room) {
  const allNames  = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) throw new ServiceError(400, unknownPlayer(name));
  }
  if (new Set(submitted).size !== submitted.length)
    throw new ServiceError(400, ERRORS.DUPLICATE_PLAYERS);
}

export function validateMatchExists(matchIndex, room) {
  if (!room.matches[matchIndex]) throw new ServiceError(400, matchNotFound(matchIndex));
}

export function validateMatchEditable(matchIndex, room) {
  const { status } = room.matches[matchIndex];
  if (status === 'done' || status === 'skipped')
    throw new ServiceError(409, ERRORS.MATCH_NOT_EDITABLE);
}

export function validatePlayerInMatch(playerName, room) {
  const match      = room.matches[room.currentMatchIndex];
  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName)) throw new ServiceError(400, playerNotInMatch(playerName));
}

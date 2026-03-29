/**
 * Validators that check request input (body / params).
 * Each returns { status, error } on failure, or null on success.
 */

import { MAX_PLAYER_NAME_LENGTH } from '../config.js';
import { ERRORS, unknownPlayer, playerNotInMatch, matchNotFound } from '../errors.js';

export function validatePlayerNameRequired(req) {
  const name = req.body?.playerName?.trim();
  if (!name)                             return { status: 400, error: ERRORS.PLAYER_NAME_REQUIRED };
  if (name.length > MAX_PLAYER_NAME_LENGTH) return { status: 400, error: ERRORS.PLAYER_NAME_TOO_LONG };
  return null;
}

export function validatePlayerNameNotTaken(req, room) {
  const name = req.body.playerName.trim();
  if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
    return { status: 409, error: ERRORS.PLAYER_NAME_TAKEN };
  return null;
}

export function validateWinner(req) {
  const { winner } = req.body;
  if (winner !== 1 && winner !== 2) return { status: 400, error: ERRORS.WINNER_INVALID };
  return null;
}

export function validateTeams(req) {
  const { team1, team2 } = req.body;
  if (!Array.isArray(team1) || team1.length !== 2) return { status: 400, error: ERRORS.TEAM1_INVALID };
  if (!Array.isArray(team2) || team2.length !== 2) return { status: 400, error: ERRORS.TEAM2_INVALID };
  return null;
}

export function validateTeamPlayers(req, room) {
  const { team1, team2 } = req.body;
  const allNames  = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return { status: 400, error: unknownPlayer(name) };
  }
  if (new Set(submitted).size !== submitted.length)
    return { status: 400, error: ERRORS.DUPLICATE_PLAYERS };
  return null;
}

export function validateMatchExists(matchIndex, room) {
  if (!room.matches[matchIndex]) return { status: 400, error: matchNotFound(matchIndex) };
  return null;
}

export function validateMatchEditable(matchIndex, room) {
  const { status } = room.matches[matchIndex];
  if (status === 'done' || status === 'skipped')
    return { status: 409, error: ERRORS.MATCH_NOT_EDITABLE };
  return null;
}

export function validatePlayerInMatch(playerName, room) {
  const match      = room.matches[room.currentMatchIndex];
  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName)) return { status: 400, error: playerNotInMatch(playerName) };
  return null;
}

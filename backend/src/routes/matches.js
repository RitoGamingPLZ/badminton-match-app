/**
 * Match operation handlers: markDone, skip, edit.
 */

import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { ERRORS, unknownPlayer, matchNotFound } from '../errors.js';
import { db, err, parseBody, hostToken, runCommand } from './helpers.js';

export async function handleMarkMatchDone(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.hostToken !== hostToken(event)) return err(stream, 403, ERRORS.NOT_HOST);
  if (!room.started) return err(stream, 409, ERRORS.SESSION_NOT_STARTED);

  const { winner, version: expectedVersion = room.version } = body;
  if (winner !== 1 && winner !== 2) return err(stream, 400, ERRORS.WINNER_INVALID);

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, ERRORS.NO_ACTIVE_MATCH);

  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion, stream);
}

export async function handleSkipMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.hostToken !== hostToken(event)) return err(stream, 403, ERRORS.NOT_HOST);
  if (!room.started) return err(stream, 409, ERRORS.SESSION_NOT_STARTED);

  const { playerName, version } = body;
  const trimmedName = playerName?.trim();
  if (!trimmedName) return err(stream, 400, ERRORS.PLAYER_NAME_REQUIRED);

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, ERRORS.NO_ACTIVE_MATCH);

  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(trimmedName)) return err(stream, 400, unknownPlayer(trimmedName));

  return runCommand(code, new SkipMatchCommand(trimmedName), room, version ?? room.version, stream);
}

export async function handleEditMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.hostToken !== hostToken(event)) return err(stream, 403, ERRORS.NOT_HOST);
  if (!room.started) return err(stream, 409, ERRORS.SESSION_NOT_STARTED);

  const { team1, team2, version: expectedVersion = room.version } = body;
  const matchIndex = body.matchIndex ?? room.currentMatchIndex;

  const match = room.matches[matchIndex];
  if (!match) return err(stream, 400, matchNotFound(matchIndex));
  if (match.status === 'done' || match.status === 'skipped') {
    return err(stream, 409, ERRORS.MATCH_NOT_EDITABLE);
  }

  if (!Array.isArray(team1) || team1.length !== 2) return err(stream, 400, ERRORS.TEAM1_INVALID);
  if (!Array.isArray(team2) || team2.length !== 2) return err(stream, 400, ERRORS.TEAM2_INVALID);

  const allNames = new Set(room.players.map(p => p.name));
  for (const name of [...team1, ...team2]) {
    if (!allNames.has(name)) return err(stream, 400, unknownPlayer(name));
  }
  if (new Set([...team1, ...team2]).size !== 4) return err(stream, 400, ERRORS.DUPLICATE_PLAYERS);

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, stream);
}

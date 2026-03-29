/**
 * Match operation handlers: markDone, skip, edit.
 */

import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { db, err, parseBody, hostToken, runCommand } from './helpers.js';

export async function handleMarkMatchDone(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { winner, version: expectedVersion = room.version } = body;
  if (winner !== 1 && winner !== 2) return err(stream, 400, 'winner must be 1 or 2');

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match');

  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion, stream);
}

export async function handleSkipMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { playerName, version } = body;
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return err(stream, 409, 'No active match');

  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName)) return err(stream, 400, `${playerName} is not in the current match`);

  return runCommand(code, new SkipMatchCommand(playerName), room, version ?? room.version, stream);
}

export async function handleEditMatch(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (!room.started) return err(stream, 409, 'Session not started');

  const { team1, team2, version: expectedVersion = room.version } = body;
  const matchIndex = body.matchIndex ?? room.currentMatchIndex;

  const match = room.matches[matchIndex];
  if (!match) return err(stream, 400, `Match index ${matchIndex} does not exist`);
  if (match.status === 'done' || match.status === 'skipped') {
    return err(stream, 409, 'Cannot edit a completed or skipped match');
  }

  if (!Array.isArray(team1) || team1.length !== 2) return err(stream, 400, 'team1 must have 2 players');
  if (!Array.isArray(team2) || team2.length !== 2) return err(stream, 400, 'team2 must have 2 players');

  const allNames = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return err(stream, 400, `Unknown player: ${name}`);
  }
  if (new Set(submitted).size !== submitted.length) return err(stream, 400, 'Duplicate players in teams');

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, stream);
}

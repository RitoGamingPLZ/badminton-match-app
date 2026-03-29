/**
 * Match operation handlers: markDone, skip, edit.
 */

import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { ERRORS, unknownPlayer, matchNotFound } from '../errors.js';
import { db, hostToken, runCommand } from './helpers.js';

export async function handleMarkMatchDone(req, res) {
  const { code } = req.params;
  const { winner, version: expectedVersion } = req.body || {};
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: ERRORS.NOT_HOST });
  if (!room.started) return res.status(409).json({ error: ERRORS.SESSION_NOT_STARTED });
  if (winner !== 1 && winner !== 2) return res.status(400).json({ error: ERRORS.WINNER_INVALID });

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return res.status(409).json({ error: ERRORS.NO_ACTIVE_MATCH });

  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion ?? room.version, res);
}

export async function handleSkipMatch(req, res) {
  const { code } = req.params;
  const { playerName, version } = req.body || {};
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: ERRORS.NOT_HOST });
  if (!room.started) return res.status(409).json({ error: ERRORS.SESSION_NOT_STARTED });

  const trimmedName = playerName?.trim();
  if (!trimmedName) return res.status(400).json({ error: ERRORS.PLAYER_NAME_REQUIRED });

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return res.status(409).json({ error: ERRORS.NO_ACTIVE_MATCH });

  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(trimmedName)) return res.status(400).json({ error: unknownPlayer(trimmedName) });

  return runCommand(code, new SkipMatchCommand(trimmedName), room, version ?? room.version, res);
}

export async function handleEditMatch(req, res) {
  const { code } = req.params;
  const { team1, team2, version: expectedVersion } = req.body || {};
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: ERRORS.NOT_HOST });
  if (!room.started) return res.status(409).json({ error: ERRORS.SESSION_NOT_STARTED });

  const matchIndex = req.body?.matchIndex ?? room.currentMatchIndex;
  const match = room.matches[matchIndex];
  if (!match) return res.status(400).json({ error: matchNotFound(matchIndex) });
  if (match.status === 'done' || match.status === 'skipped')
    return res.status(409).json({ error: ERRORS.MATCH_NOT_EDITABLE });

  if (!Array.isArray(team1) || team1.length !== 2) return res.status(400).json({ error: ERRORS.TEAM1_INVALID });
  if (!Array.isArray(team2) || team2.length !== 2) return res.status(400).json({ error: ERRORS.TEAM2_INVALID });

  const allNames = new Set(room.players.map(p => p.name));
  for (const name of [...team1, ...team2]) {
    if (!allNames.has(name)) return res.status(400).json({ error: unknownPlayer(name) });
  }
  if (new Set([...team1, ...team2]).size !== 4) return res.status(400).json({ error: ERRORS.DUPLICATE_PLAYERS });

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion ?? room.version, res);
}

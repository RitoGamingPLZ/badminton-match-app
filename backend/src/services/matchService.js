/**
 * Match mutation service functions.
 *
 * Handles: markMatchDone, skipMatch, editMatch
 * Each function is an Express (req, res) handler.
 */

import { getRepository, VersionConflictError } from '../db/index.js';
import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { safeRoom, pushUndo, pushLog, makeSnapshot } from '../helpers.js';

const db = getRepository();

// ── Command executor ──────────────────────────────────────────────────────────

async function runCommand(code, command, room, expectedVersion, res) {
  const snapshot     = makeSnapshot(room);
  const { patch, logEntry } = command.execute(room);
  const undoStack    = pushUndo(room, snapshot);
  const operationLog = pushLog(room, logEntry);

  try {
    const updated = await db.saveState(
      code,
      { ...patch, undoStack, operationLog },
      expectedVersion,
    );
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError)
      return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHostToken(req) {
  return req.headers['x-host-token'] || req.body?.hostToken || '';
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function markMatchDone(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== getHostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const { winner, version: expectedVersion = room.version } = req.body;
  if (winner !== 1 && winner !== 2) return res.status(400).json({ error: 'winner must be 1 or 2' });

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return res.status(409).json({ error: 'No active match' });

  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion, res);
}

export async function skipMatch(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== getHostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const { playerName, version } = req.body;
  if (!playerName?.trim()) return res.status(400).json({ error: 'playerName is required' });

  const match = room.matches[room.currentMatchIndex];
  if (!match || match.status !== 'active') return res.status(409).json({ error: 'No active match' });

  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName))
    return res.status(400).json({ error: `${playerName} is not in the current match` });

  return runCommand(code, new SkipMatchCommand(playerName), room, version ?? room.version, res);
}

export async function editMatch(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== getHostToken(req)) return res.status(403).json({ error: 'Not the host' });
  if (!room.started) return res.status(409).json({ error: 'Session not started' });

  const { team1, team2, version: expectedVersion = room.version } = req.body;
  const matchIndex = req.body.matchIndex ?? room.currentMatchIndex;

  const match = room.matches[matchIndex];
  if (!match) return res.status(400).json({ error: `Match index ${matchIndex} does not exist` });
  if (match.status === 'done' || match.status === 'skipped')
    return res.status(409).json({ error: 'Cannot edit a completed or skipped match' });

  if (!Array.isArray(team1) || team1.length !== 2)
    return res.status(400).json({ error: 'team1 must have 2 players' });
  if (!Array.isArray(team2) || team2.length !== 2)
    return res.status(400).json({ error: 'team2 must have 2 players' });

  const allNames  = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return res.status(400).json({ error: `Unknown player: ${name}` });
  }
  if (new Set(submitted).size !== submitted.length)
    return res.status(400).json({ error: 'Duplicate players in teams' });

  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, res);
}

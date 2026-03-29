/**
 * Match mutation service functions.
 *
 * Handles: markMatchDone, skipMatch, editMatch
 * Each function is an Express (req, res) handler.
 */

import { getRepository, VersionConflictError } from '../db/index.js';
import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { safeRoom, pushUndo, pushLog, makeSnapshot } from '../helpers.js';
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

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function markMatchDone(req, res) {
  const { code } = req.params;
  const room     = await db.getRoom(code);

  const invalid =
    validateRoomExists(room)    ||
    validateIsHost(req, room)   ||
    validateSessionStarted(room)||
    validateWinner(req)         ||
    validateActiveMatch(room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const { winner, version: expectedVersion = room.version } = req.body;
  return runCommand(code, new MatchDoneCommand(winner), room, expectedVersion, res);
}

export async function skipMatch(req, res) {
  const { code } = req.params;
  const room     = await db.getRoom(code);

  const invalid =
    validateRoomExists(room)                               ||
    validateIsHost(req, room)                              ||
    validateSessionStarted(room)                           ||
    validatePlayerNameRequired(req)                        ||
    validateActiveMatch(room)                              ||
    validatePlayerInMatch(req.body.playerName?.trim(), room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const { playerName, version } = req.body;
  return runCommand(code, new SkipMatchCommand(playerName.trim()), room, version ?? room.version, res);
}

export async function editMatch(req, res) {
  const { code } = req.params;
  const room     = await db.getRoom(code);

  const matchIndex = req.body.matchIndex ?? room?.currentMatchIndex;

  const invalid =
    validateRoomExists(room)                ||
    validateIsHost(req, room)               ||
    validateSessionStarted(room)            ||
    validateTeams(req)                      ||
    validateMatchExists(matchIndex, room)   ||
    validateMatchEditable(matchIndex, room) ||
    validateTeamPlayers(req, room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const { team1, team2, version: expectedVersion = room.version } = req.body;
  return runCommand(code, new EditMatchCommand(matchIndex, team1, team2), room, expectedVersion, res);
}

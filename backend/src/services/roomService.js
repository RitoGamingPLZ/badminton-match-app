/**
 * Room lifecycle service functions.
 *
 * Handles: createRoom, joinRoom, getRoom, startSession, addMatches
 * Each function is an Express (req, res) handler.
 *
 * All DB calls are wrapped with withRetry (3 attempts, 300/600/900 ms delays).
 * Version conflicts on startSession / addMatches are returned as 409 (client retries manually).
 */

import { randomUUID } from 'crypto';
import { getRepository, VersionConflictError } from '../db/index.js';
import { generateMatches, calculateInitialRounds } from '../matchGen.js';
import { safeRoom, withRetry } from '../helpers.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionNotStarted,
  validateMinPlayers,
  validatePlayerNameRequired,
  validatePlayerNameNotTaken,
} from '../validation/index.js';

const db = getRepository();

export async function createRoom(req, res) {
  const invalid = validatePlayerNameRequired(req);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const { playerName, additionalPlayers = [] } = req.body;

  const seen    = new Set([playerName.trim().toLowerCase()]);
  const players = [{ name: playerName.trim(), gamesPlayed: 0 }];
  for (const n of additionalPlayers) {
    const trimmed = n?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    players.push({ name: trimmed, gamesPlayed: 0 });
  }

  let code, attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    if (++attempts > 20) return res.status(503).json({ error: 'Could not generate unique room code' });
  } while (await withRetry(() => db.getRoom(code)));

  const token = randomUUID();
  const room  = await withRetry(() => db.createRoom({
    code, hostToken: token, format: 'doubles', started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [], unavailablePlayers: [],
  }));

  res.status(201).json({ hostToken: token, room: safeRoom(room) });
}

export async function joinRoom(req, res) {
  const { code } = req.params;
  const room     = await withRetry(() => db.getRoom(code));

  const invalid =
    validateRoomExists(room)        ||
    validateSessionNotStarted(room) ||
    validatePlayerNameRequired(req) ||
    validatePlayerNameNotTaken(req, room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const updated = await withRetry(() =>
    db.addPlayer(code, { name: req.body.playerName.trim(), gamesPlayed: 0 }, room.version)
  );
  res.status(200).json({ room: safeRoom(updated) });
}

export async function getRoom(req, res) {
  const room    = await withRetry(() => db.getRoom(req.params.code));
  const invalid = validateRoomExists(room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  res.status(200).json({ room: safeRoom(room) });
}

export async function startSession(req, res) {
  const { code } = req.params;
  const room     = await withRetry(() => db.getRoom(code));

  const invalid =
    validateRoomExists(room)        ||
    validateIsHost(req, room)       ||
    validateSessionNotStarted(room) ||
    validateMinPlayers(room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const matches = generateMatches(room.players, calculateInitialRounds(room.players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await withRetry(() =>
      db.startSession(code, matches, req.body.version ?? room.version)
    );
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
}

export async function addMatches(req, res) {
  const { code } = req.params;
  const room     = await withRetry(() => db.getRoom(code));

  const invalid = validateRoomExists(room) || validateIsHost(req, room);
  if (invalid) return res.status(invalid.status).json({ error: invalid.error });

  const count      = Math.min(req.body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await withRetry(() =>
      db.appendMatches(code, newMatches, req.body.version ?? room.version)
    );
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
}

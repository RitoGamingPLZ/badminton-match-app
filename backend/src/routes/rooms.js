/**
 * Room lifecycle handlers: create, join, get, start, addMatches.
 */

import { randomUUID } from 'crypto';
import { generateMatches, calculateInitialRounds } from '../matchGen.js';
import { VersionConflictError } from '../db/index.js';
import { safeRoom } from '../roomUtils.js';
import { ERRORS } from '../errors.js';
import { db, hostToken } from './helpers.js';

export async function handleCreateRoom(req, res) {
  const { playerName, additionalPlayers = [] } = req.body || {};
  const trimmedName = playerName?.trim();
  if (!trimmedName) return res.status(400).json({ error: ERRORS.PLAYER_NAME_REQUIRED });

  const seen    = new Set([trimmedName.toLowerCase()]);
  const players = [{ name: trimmedName, gamesPlayed: 0 }];
  for (const n of additionalPlayers) {
    const trimmed = n?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    players.push({ name: trimmed, gamesPlayed: 0 });
  }

  let code, attempts = 0;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
    if (++attempts > 20) return res.status(503).json({ error: ERRORS.ROOM_CODE_UNAVAILABLE });
  } while (await db.getRoom(code));

  const token = randomUUID();
  const room  = await db.createRoom({
    code, hostToken: token, format: 'doubles', started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [], unavailablePlayers: [],
  });

  res.status(201).json({ hostToken: token, room: safeRoom(room) });
}

export async function handleJoinRoom(req, res) {
  const { code } = req.params;
  const trimmedName = req.body?.playerName?.trim();
  if (!trimmedName) return res.status(400).json({ error: ERRORS.PLAYER_NAME_REQUIRED });

  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.started) return res.status(409).json({ error: ERRORS.SESSION_STARTED });

  if (room.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase()))
    return res.status(409).json({ error: ERRORS.PLAYER_NAME_TAKEN });

  const updated = await db.addPlayer(code, { name: trimmedName, gamesPlayed: 0 }, room.version);
  res.status(200).json({ room: safeRoom(updated) });
}

export async function handleGetRoom(req, res) {
  const room = await db.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  res.status(200).json({ room: safeRoom(room) });
}

export async function handleStartSession(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: ERRORS.NOT_HOST });
  if (room.started) return res.status(409).json({ error: ERRORS.SESSION_STARTED });
  if (room.players.length < 4) return res.status(400).json({ error: ERRORS.MIN_PLAYERS });

  const matches = generateMatches(room.players, calculateInitialRounds(room.players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await db.startSession(code, matches, req.body?.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: ERRORS.VERSION_CONFLICT });
    throw e;
  }
}

export async function handleAddMatches(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: ERRORS.ROOM_NOT_FOUND });
  if (room.hostToken !== hostToken(req)) return res.status(403).json({ error: ERRORS.NOT_HOST });

  const count      = Math.min(req.body?.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await db.appendMatches(code, newMatches, req.body?.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: ERRORS.VERSION_CONFLICT });
    throw e;
  }
}

/**
 * Room lifecycle service functions.
 *
 * Handles: createRoom, joinRoom, getRoom, startSession, addMatches
 * Each function is an Express (req, res) handler.
 */

import { randomUUID } from 'crypto';
import { getRepository, VersionConflictError } from '../db/index.js';
import { generateMatches, calculateInitialRounds } from '../matchGen.js';
import { safeRoom } from '../helpers.js';

const db = getRepository();

export async function createRoom(req, res) {
  const { playerName, additionalPlayers = [] } = req.body;
  if (!playerName?.trim()) return res.status(400).json({ error: 'playerName is required' });

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
  } while (await db.getRoom(code));

  const token = randomUUID();
  const room  = await db.createRoom({
    code, hostToken: token, format: 'doubles', started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [], unavailablePlayers: [],
  });

  res.status(201).json({ hostToken: token, room: safeRoom(room) });
}

export async function joinRoom(req, res) {
  const { code } = req.params;
  const { playerName } = req.body;
  if (!playerName?.trim()) return res.status(400).json({ error: 'playerName is required' });

  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.started) return res.status(409).json({ error: 'Session already started' });

  const nameTaken = room.players.some(
    p => p.name.toLowerCase() === playerName.trim().toLowerCase()
  );
  if (nameTaken) return res.status(409).json({ error: 'Name already taken in this room' });

  const updated = await db.addPlayer(code, { name: playerName.trim(), gamesPlayed: 0 }, room.version);
  res.status(200).json({ room: safeRoom(updated) });
}

export async function getRoom(req, res) {
  const room = await db.getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.status(200).json({ room: safeRoom(room) });
}

export async function startSession(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== (req.headers['x-host-token'] || req.body?.hostToken || ''))
    return res.status(403).json({ error: 'Not the host' });
  if (room.started) return res.status(409).json({ error: 'Session already started' });
  if (room.players.length < 4) return res.status(400).json({ error: 'Need at least 4 players for doubles' });

  const matches = generateMatches(room.players, calculateInitialRounds(room.players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await db.startSession(code, matches, req.body.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
}

export async function addMatches(req, res) {
  const { code } = req.params;
  const room = await db.getRoom(code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.hostToken !== (req.headers['x-host-token'] || req.body?.hostToken || ''))
    return res.status(403).json({ error: 'Not the host' });

  const count      = Math.min(req.body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await db.appendMatches(code, newMatches, req.body.version ?? room.version);
    res.status(200).json({ room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return res.status(409).json({ error: 'Version conflict — reload and retry' });
    throw e;
  }
}

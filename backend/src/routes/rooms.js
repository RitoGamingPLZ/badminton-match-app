/**
 * Room lifecycle handlers: create, join, get, start, addMatches.
 */

import { randomUUID } from 'crypto';
import { generateMatches, calculateInitialRounds } from '../matchGen.js';
import { VersionConflictError } from '../db/index.js';
import { safeRoom } from '../helpers.js';
import { db, jsonResponse, err, parseBody, hostToken } from './helpers.js';

export async function handleCreateRoom(event, stream) {
  const { playerName, additionalPlayers = [] } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

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
    if (++attempts > 20) return err(stream, 503, 'Could not generate unique room code');
  } while (await db.getRoom(code));

  const token = randomUUID();
  const room  = await db.createRoom({
    code, hostToken: token, format: 'doubles', started: false,
    players, matches: [], currentMatchIndex: 0,
    undoStack: [], operationLog: [], unavailablePlayers: [],
  });

  jsonResponse(stream, 201, { hostToken: token, room: safeRoom(room) });
}

export async function handleJoinRoom(code, event, stream) {
  const { playerName } = parseBody(event);
  if (!playerName?.trim()) return err(stream, 400, 'playerName is required');

  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.started) return err(stream, 409, 'Session already started');

  const nameTaken = room.players.some(
    p => p.name.toLowerCase() === playerName.trim().toLowerCase()
  );
  if (nameTaken) return err(stream, 409, 'Name already taken in this room');

  const updated = await db.addPlayer(code, { name: playerName.trim(), gamesPlayed: 0 }, room.version);
  jsonResponse(stream, 200, { room: safeRoom(updated) });
}

export async function handleGetRoom(code, stream) {
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  jsonResponse(stream, 200, { room: safeRoom(room) });
}

export async function handleStartSession(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');
  if (room.started) return err(stream, 409, 'Session already started');

  const { players } = room;
  if (players.length < 4) return err(stream, 400, 'Need at least 4 players for doubles');

  const matches = generateMatches(players, calculateInitialRounds(players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await db.startSession(code, matches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

export async function handleAddMatches(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, 'Room not found');
  if (room.hostToken !== hostToken(event)) return err(stream, 403, 'Not the host');

  const count      = Math.min(body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await db.appendMatches(code, newMatches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, 'Version conflict — reload and retry');
    throw e;
  }
}

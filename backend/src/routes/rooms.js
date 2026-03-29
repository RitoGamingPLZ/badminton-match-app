/**
 * Room lifecycle handlers: create, join, get, start, addMatches.
 */

import { randomUUID } from 'crypto';
import { generateMatches, calculateInitialRounds } from '../matchGen.js';
import { VersionConflictError } from '../db/index.js';
import { safeRoom } from '../roomUtils.js';
import { ERRORS } from '../errors.js';
import { db, jsonResponse, err, parseBody, hostToken } from './helpers.js';

export async function handleCreateRoom(event, stream) {
  const { playerName, additionalPlayers = [] } = parseBody(event);
  const trimmedName = playerName?.trim();
  if (!trimmedName) return err(stream, 400, ERRORS.PLAYER_NAME_REQUIRED);

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
    if (++attempts > 20) return err(stream, 503, ERRORS.ROOM_CODE_UNAVAILABLE);
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
  const trimmedName = playerName?.trim();
  if (!trimmedName) return err(stream, 400, ERRORS.PLAYER_NAME_REQUIRED);

  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.started) return err(stream, 409, ERRORS.SESSION_STARTED);

  const nameTaken = room.players.some(
    p => p.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (nameTaken) return err(stream, 409, ERRORS.PLAYER_NAME_TAKEN);

  const updated = await db.addPlayer(code, { name: trimmedName, gamesPlayed: 0 }, room.version);
  jsonResponse(stream, 200, { room: safeRoom(updated) });
}

export async function handleGetRoom(code, stream) {
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  jsonResponse(stream, 200, { room: safeRoom(room) });
}

export async function handleStartSession(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.hostToken !== hostToken(event)) return err(stream, 403, ERRORS.NOT_HOST);
  if (room.started) return err(stream, 409, ERRORS.SESSION_STARTED);
  if (room.players.length < 4) return err(stream, 400, ERRORS.MIN_PLAYERS);

  const matches = generateMatches(room.players, calculateInitialRounds(room.players.length), 1);
  if (matches.length) matches[0].status = 'active';

  try {
    const updated = await db.startSession(code, matches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, ERRORS.VERSION_CONFLICT);
    throw e;
  }
}

export async function handleAddMatches(code, event, stream) {
  const body = parseBody(event);
  const room = await db.getRoom(code);
  if (!room) return err(stream, 404, ERRORS.ROOM_NOT_FOUND);
  if (room.hostToken !== hostToken(event)) return err(stream, 403, ERRORS.NOT_HOST);

  const count      = Math.min(body.count || 5, 20);
  const startId    = room.matches.length + 1;
  const newMatches = generateMatches(room.players, count, startId);

  try {
    const updated = await db.appendMatches(code, newMatches, body.version ?? room.version);
    jsonResponse(stream, 200, { room: safeRoom(updated) });
  } catch (e) {
    if (e instanceof VersionConflictError) return err(stream, 409, ERRORS.VERSION_CONFLICT);
    throw e;
  }
}

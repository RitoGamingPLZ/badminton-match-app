/**
 * RoomService — room lifecycle business logic.
 *
 * Owns: create, join, get, startSession, addMatches.
 * Validators are called with plain values; the service throws ServiceError
 * on any business-rule violation so route handlers stay thin.
 */

import { randomUUID } from 'crypto';
import { generateMatches, calculateInitialRounds } from '../matchGen.js';
import { safeRoom } from '../roomUtils.js';
import { ServiceError, ERRORS } from '../errors.js';
import { VersionConflictError } from '../db/index.js';
import {
  validatePlayerName,
  validatePlayerNotTaken,
} from '../validation/inputValidators.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionNotStarted,
  validateMinPlayers,
} from '../validation/roomValidators.js';

export class RoomService {
  #db;

  constructor(db) {
    this.#db = db;
  }

  async createRoom({ playerName, additionalPlayers = [] }) {
    const trimmedName = playerName?.trim() ?? '';
    validatePlayerName(trimmedName);

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
      if (++attempts > 20) throw new ServiceError(503, ERRORS.ROOM_CODE_UNAVAILABLE);
    } while (await this.#db.getRoom(code));

    const token = randomUUID();
    const room  = await this.#db.createRoom({
      code, hostToken: token, format: 'doubles', started: false,
      players, matches: [], currentMatchIndex: 0,
      undoStack: [], operationLog: [], unavailablePlayers: [],
    });

    return { hostToken: token, room: safeRoom(room) };
  }

  async joinRoom(code, playerName) {
    const trimmedName = playerName?.trim() ?? '';
    validatePlayerName(trimmedName);

    const room = await this.#db.getRoom(code);
    validateRoomExists(room);
    validateSessionNotStarted(room);
    validatePlayerNotTaken(trimmedName, room);

    const updated = await this.#db.addPlayer(code, { name: trimmedName, gamesPlayed: 0 }, room.version);
    return { room: safeRoom(updated) };
  }

  async getRoom(code) {
    const room = await this.#db.getRoom(code);
    validateRoomExists(room);
    return { room: safeRoom(room) };
  }

  async startSession(code, token, version) {
    const room = await this.#db.getRoom(code);
    validateRoomExists(room);
    validateIsHost(token, room);
    validateSessionNotStarted(room);
    validateMinPlayers(room);

    const matches = generateMatches(room.players, calculateInitialRounds(room.players.length), 1);
    if (matches.length) matches[0].status = 'active';

    try {
      const updated = await this.#db.startSession(code, matches, version ?? room.version);
      return { room: safeRoom(updated) };
    } catch (e) {
      if (e instanceof VersionConflictError) throw new ServiceError(409, ERRORS.VERSION_CONFLICT);
      throw e;
    }
  }

  async addMatches(code, token, count, version) {
    const room = await this.#db.getRoom(code);
    validateRoomExists(room);
    validateIsHost(token, room);

    const safeCount  = Math.min(count || 5, 20);
    const startId    = room.matches.length + 1;
    const newMatches = generateMatches(room.players, safeCount, startId);

    try {
      const updated = await this.#db.appendMatches(code, newMatches, version ?? room.version);
      return { room: safeRoom(updated) };
    } catch (e) {
      if (e instanceof VersionConflictError) throw new ServiceError(409, ERRORS.VERSION_CONFLICT);
      throw e;
    }
  }

}

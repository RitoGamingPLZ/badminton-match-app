/**
 * In-memory repository — useful for unit tests and quick local runs
 * where you don't want a real database.
 *
 * State lives in a plain Map and is lost when the process exits.
 * Expired rooms are lazily pruned on each getRoom call.
 */

import { VersionConflictError } from './errors.js';

const TTL_MS = 24 * 60 * 60 * 1000;

export class InMemoryRepository {
  #store = new Map();

  // ── TTL ─────────────────────────────────────────────────────────────────────

  #purgeExpired() {
    const now = Date.now();
    for (const [code, room] of this.#store) {
      if (room.ttl && room.ttl < now) this.#store.delete(code);
    }
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getRoom(code) {
    this.#purgeExpired();
    const room = this.#store.get(code);
    return room ? structuredClone(room) : null;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async createRoom(room) {
    const item = {
      ...room,
      version: 1,
      ttl: Date.now() + TTL_MS,
    };
    this.#store.set(room.code, structuredClone(item));
    return structuredClone(item);
  }

  // ── Generic versioned update ────────────────────────────────────────────────

  #apply(code, expectedVersion, updater) {
    const room = this.#store.get(code);
    if (!room) throw new Error('Room not found');
    if (room.version !== expectedVersion) throw new VersionConflictError();
    const updated = { ...room, ...updater(room), version: expectedVersion + 1 };
    this.#store.set(code, updated);
    return structuredClone(updated);
  }

  // ── Full-state save ─────────────────────────────────────────────────────────

  async saveState(code, patch, expectedVersion) {
    return this.#apply(code, expectedVersion, () => {
      const fields = {};
      if (patch.matches !== undefined)            fields.matches            = patch.matches;
      if (patch.players !== undefined)            fields.players            = patch.players;
      if (patch.currentMatchIndex !== undefined)  fields.currentMatchIndex  = patch.currentMatchIndex;
      if (patch.undoStack !== undefined)          fields.undoStack          = patch.undoStack;
      if (patch.operationLog !== undefined)       fields.operationLog       = patch.operationLog;
      if (patch.unavailablePlayers !== undefined) fields.unavailablePlayers = patch.unavailablePlayers;
      return fields;
    });
  }

  // ── Convenience wrappers ────────────────────────────────────────────────────

  async addPlayer(code, player, expectedVersion) {
    return this.#apply(code, expectedVersion, room => ({
      players: [...room.players, player],
      ttl: Date.now() + TTL_MS,
    }));
  }

  async startSession(code, matches, expectedVersion) {
    return this.#apply(code, expectedVersion, () => ({
      matches,
      currentMatchIndex: 0,
      started: true,
    }));
  }

  async appendMatches(code, newMatches, expectedVersion) {
    return this.#apply(code, expectedVersion, room => ({
      matches: [...room.matches, ...newMatches],
    }));
  }
}

/**
 * MongoDB implementation of the room repository.
 *
 * Optimistic concurrency is implemented with a `version` field checked via
 * a `findOneAndUpdate` filter.  If no document matches (version mismatch or
 * room deleted), a VersionConflictError is thrown.
 *
 * TTL: MongoDB TTL index on the `ttl` field (stored as a Date).  Documents
 * are automatically deleted after their `ttl` timestamp has passed.
 */

import { MongoClient } from 'mongodb';
import { VersionConflictError } from './errors.js';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class MongoRepository {
  #client;
  #dbName;
  #coll = null;

  constructor(uri, dbName) {
    this.#client = new MongoClient(uri);
    this.#dbName  = dbName || 'badminton';
  }

  // Lazy connect + index setup on first use
  async #collection() {
    if (this.#coll) return this.#coll;

    await this.#client.connect();
    const coll = this.#client.db(this.#dbName).collection('rooms');

    // Unique index on room code
    await coll.createIndex({ code: 1 }, { unique: true });
    // TTL index — MongoDB deletes documents when Date field <= now
    await coll.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });

    this.#coll = coll;
    return coll;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getRoom(code) {
    const coll = await this.#collection();
    return coll.findOne({ code }, { projection: { _id: 0 } });
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async createRoom(room) {
    const coll = await this.#collection();
    const item = {
      ...room,
      version: 1,
      ttl: new Date(Date.now() + TTL_MS),
    };
    await coll.insertOne(item);
    // MongoDB adds _id to the object in-place; strip it before returning
    const { _id, ...result } = item;
    return result;
  }

  // ── Generic versioned update ────────────────────────────────────────────────

  async #versionedUpdate(code, expectedVersion, update) {
    const coll = await this.#collection();
    const doc = await coll.findOneAndUpdate(
      { code, version: expectedVersion },
      { ...update, $set: { ...(update.$set ?? {}), version: expectedVersion + 1 } },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    if (!doc) throw new VersionConflictError();
    return doc;
  }

  // ── Full-state save ─────────────────────────────────────────────────────────

  async saveState(code, patch, expectedVersion) {
    const fields = {};
    if (patch.matches !== undefined)           fields.matches           = patch.matches;
    if (patch.players !== undefined)           fields.players           = patch.players;
    if (patch.currentMatchIndex !== undefined) fields.currentMatchIndex = patch.currentMatchIndex;
    if (patch.undoStack !== undefined)           fields.undoStack           = patch.undoStack;
    if (patch.operationLog !== undefined)        fields.operationLog        = patch.operationLog;
    if (patch.unavailablePlayers !== undefined)  fields.unavailablePlayers  = patch.unavailablePlayers;

    return this.#versionedUpdate(code, expectedVersion, { $set: fields });
  }

  // ── Convenience wrappers ────────────────────────────────────────────────────

  async addPlayer(code, player, expectedVersion) {
    return this.#versionedUpdate(code, expectedVersion, {
      $push: { players: player },
      $set:  { ttl: new Date(Date.now() + TTL_MS) },
    });
  }

  async startSession(code, matches, expectedVersion) {
    return this.#versionedUpdate(code, expectedVersion, {
      $set: { matches, currentMatchIndex: 0, started: true },
    });
  }

  async appendMatches(code, newMatches, expectedVersion) {
    return this.#versionedUpdate(code, expectedVersion, {
      $push: { matches: { $each: newMatches } },
    });
  }
}

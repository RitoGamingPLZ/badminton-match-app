/**
 * Firestore implementation of the room repository.
 *
 * Uses Firestore transactions for optimistic locking — the in-transaction
 * version check replaces DynamoDB's ConditionExpression.  All conflict errors
 * are normalised to VersionConflictError so the handler stays database-agnostic.
 *
 * Environment variables:
 *   GCP_PROJECT_ID      — GCP project (required)
 *   FIRESTORE_DATABASE  — database ID, default "(default)"
 *   FIRESTORE_COLLECTION — collection name, default "rooms"
 */

import { Firestore } from '@google-cloud/firestore';
import { VersionConflictError } from './errors.js';

const TTL_MS = 60 * 60 * 24 * 1000; // 24 hours

export class FirestoreRepository {
  constructor() {
    this.db = new Firestore({
      projectId:  process.env.GCP_PROJECT_ID,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    this.col = this.db.collection(
      process.env.FIRESTORE_COLLECTION || 'rooms'
    );
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getRoom(code) {
    const snap = await this.col.doc(code).get();
    return snap.exists ? snap.data() : null;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async createRoom(room) {
    const ref  = this.col.doc(room.code);
    const item = {
      ...room,
      version:   1,
      expiresAt: new Date(Date.now() + TTL_MS),
    };
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const err = new Error('Room already exists');
        err.code  = 6; // gRPC ALREADY_EXISTS
        throw err;
      }
      tx.set(ref, item);
    });
    return item;
  }

  // ── Generic transactional update ────────────────────────────────────────────

  async #txUpdate(code, expectedVersion, applyFn) {
    const ref = this.col.doc(code);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`Room not found: ${code}`);

      const data = snap.data();
      if (data.version !== expectedVersion) throw new VersionConflictError();

      const next = applyFn(data);
      tx.update(ref, next);
      return next;
    });
  }

  // ── Full-state save ─────────────────────────────────────────────────────────

  async saveState(code, patch, expectedVersion) {
    return this.#txUpdate(code, expectedVersion, (data) => {
      const next = { ...data, version: data.version + 1 };
      if (patch.matches             !== undefined) next.matches             = patch.matches;
      if (patch.players             !== undefined) next.players             = patch.players;
      if (patch.currentMatchIndex   !== undefined) next.currentMatchIndex   = patch.currentMatchIndex;
      if (patch.undoStack           !== undefined) next.undoStack           = patch.undoStack;
      if (patch.operationLog        !== undefined) next.operationLog        = patch.operationLog;
      if (patch.unavailablePlayers  !== undefined) next.unavailablePlayers  = patch.unavailablePlayers;
      return next;
    });
  }

  // ── Convenience wrappers ────────────────────────────────────────────────────

  async addPlayer(code, player, expectedVersion) {
    return this.#txUpdate(code, expectedVersion, (data) => ({
      ...data,
      players:   [...(data.players ?? []), player],
      version:   data.version + 1,
      expiresAt: new Date(Date.now() + TTL_MS),
    }));
  }

  async startSession(code, matches, expectedVersion) {
    return this.#txUpdate(code, expectedVersion, (data) => ({
      ...data,
      matches,
      currentMatchIndex: 0,
      started: true,
      version: data.version + 1,
    }));
  }

  async appendMatches(code, newMatches, expectedVersion) {
    return this.#txUpdate(code, expectedVersion, (data) => ({
      ...data,
      matches: [...(data.matches ?? []), ...newMatches],
      version: data.version + 1,
    }));
  }
}

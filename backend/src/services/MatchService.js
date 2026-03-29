/**
 * MatchService — match operation business logic.
 *
 * Owns: markDone, skipMatch, editMatch.
 *
 * #executeCommand handles undo-snapshot bookkeeping and optimistic-concurrency
 * retries with TRANSACTION_DELAYS_MS progressive backoff.
 */

import { MatchDoneCommand, SkipMatchCommand, EditMatchCommand } from '../commands/index.js';
import { safeRoom, makeSnapshot, pushUndo, pushLog } from '../roomUtils.js';
import { withRetry, withConflictRetry } from '../db/transaction.js';
import {
  validateWinner,
  validatePlayerName,
  validatePlayerInMatch,
  validateTeams,
  validateTeamPlayers,
  validateMatchExists,
  validateMatchEditable,
} from '../validation/inputValidators.js';
import {
  validateRoomExists,
  validateIsHost,
  validateSessionStarted,
  validateActiveMatch,
} from '../validation/roomValidators.js';

export class MatchService {
  #db;

  constructor(db) {
    this.#db = db;
  }

  async markDone(code, token, winner, version) {
    validateWinner(winner);

    const room = await withRetry(() => this.#db.getRoom(code));
    validateRoomExists(room);
    validateIsHost(token, room);
    validateSessionStarted(room);
    validateActiveMatch(room);

    return this.#executeCommand(code, new MatchDoneCommand(winner), room, version ?? room.version);
  }

  async skipMatch(code, token, playerName, version) {
    const trimmedName = playerName?.trim() ?? '';
    validatePlayerName(trimmedName);

    const room = await withRetry(() => this.#db.getRoom(code));
    validateRoomExists(room);
    validateIsHost(token, room);
    validateSessionStarted(room);
    validateActiveMatch(room);

    validatePlayerInMatch(trimmedName, room);

    return this.#executeCommand(code, new SkipMatchCommand(trimmedName), room, version ?? room.version);
  }

  async editMatch(code, token, matchIndex, team1, team2, version) {
    validateTeams(team1, team2);

    const room           = await withRetry(() => this.#db.getRoom(code));
    const resolvedIndex  = matchIndex ?? room.currentMatchIndex;
    validateRoomExists(room);
    validateIsHost(token, room);
    validateSessionStarted(room);
    validateMatchExists(resolvedIndex, room);
    validateMatchEditable(resolvedIndex, room);
    validateTeamPlayers(team1, team2, room);

    return this.#executeCommand(
      code,
      new EditMatchCommand(resolvedIndex, team1, team2),
      room,
      version ?? room.version,
    );
  }

  /**
   * Execute a Command with undo-snapshot bookkeeping and optimistic-concurrency
   * retry via withConflictRetry.
   */
  async #executeCommand(code, command, room, expectedVersion) {
    const buildPatch = () => {
      const snapshot     = makeSnapshot(room);
      const { patch, logEntry } = command.execute(room);
      return { ...patch, undoStack: pushUndo(room, snapshot), operationLog: pushLog(room, logEntry) };
    };

    return withConflictRetry(
      () => withRetry(() => this.#db.saveState(code, buildPatch(), expectedVersion))
              .then(updated => ({ room: safeRoom(updated) })),
      async () => {
        room = await withRetry(() => this.#db.getRoom(code));
        expectedVersion = room.version;
      },
    );
  }
}

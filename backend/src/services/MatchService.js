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
import { ServiceError, ERRORS, playerNotInMatch } from '../errors.js';
import { VersionConflictError } from '../db/index.js';
import { withRetry, sleep } from '../db/transaction.js';
import {
  validateWinner,
  validatePlayerName,
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

const TRANSACTION_DELAYS_MS = [300, 600, 900];

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

    // Validate the named player is actually in the current match
    const match      = room.matches[room.currentMatchIndex];
    const allPlayers = new Set([...match.team1, ...match.team2]);
    if (!allPlayers.has(trimmedName))
      throw new ServiceError(400, playerNotInMatch(trimmedName));

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
   * retry. On VersionConflictError, waits TRANSACTION_DELAYS_MS[attempt] and
   * re-reads the room before retrying the save.
   */
  async #executeCommand(code, command, room, expectedVersion) {
    for (let attempt = 0; attempt < TRANSACTION_DELAYS_MS.length; attempt++) {
      const snapshot     = makeSnapshot(room);
      const { patch, logEntry } = command.execute(room);
      const undoStack    = pushUndo(room, snapshot);
      const operationLog = pushLog(room, logEntry);

      try {
        const updated = await withRetry(() =>
          this.#db.saveState(code, { ...patch, undoStack, operationLog }, expectedVersion)
        );
        return { room: safeRoom(updated) };
      } catch (e) {
        if (!(e instanceof VersionConflictError)) throw e;
        if (attempt === TRANSACTION_DELAYS_MS.length - 1)
          throw new ServiceError(409, ERRORS.VERSION_CONFLICT);
        await sleep(TRANSACTION_DELAYS_MS[attempt]);
        room = await withRetry(() => this.#db.getRoom(code));
        expectedVersion = room.version;
      }
    }
  }
}

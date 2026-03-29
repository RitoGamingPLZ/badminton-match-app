/**
 * Command pattern for all room-mutating operations.
 *
 * Each command encapsulates a single state transition.
 * Commands are stateless with respect to DynamoDB — they receive the current
 * room object, compute the next state, and return a patch + log entry.
 * The handler is responsible for persistence and undo-stack management.
 *
 * Interface (all commands implement):
 *   execute(room) → { patch: object, logEntry: object }
 *
 *   patch     — fields to merge into the saved room state
 *   logEntry  — { type, matchNum, description } appended to operationLog
 */

import { generateMatches, regenerateUnpinnedMatches } from './matchGen.js';

// ── MatchDoneCommand ──────────────────────────────────────────────────────────

export class MatchDoneCommand {
  constructor(winner) {
    this.winner = winner; // 1 | 2
  }

  execute(room) {
    const idx   = room.currentMatchIndex;
    const match = room.matches[idx];

    const updatedMatches = [...room.matches];
    updatedMatches[idx] = { ...match, status: 'done', winner: this.winner };

    const nextIdx = idx + 1;
    if (nextIdx < updatedMatches.length) {
      updatedMatches[nextIdx] = { ...updatedMatches[nextIdx], status: 'active' };
    }

    const participants   = new Set([...match.team1, ...match.team2]);
    const updatedPlayers = room.players.map(p =>
      participants.has(p.name) ? { ...p, gamesPlayed: p.gamesPlayed + 1 } : p
    );

    const winnerNames = this.winner === 1 ? match.team1 : match.team2;
    const loserNames  = this.winner === 1 ? match.team2 : match.team1;

    return {
      patch: {
        matches:            updatedMatches,
        players:            updatedPlayers,
        currentMatchIndex:  nextIdx,
      },
      logEntry: {
        type:        'match_done',
        matchNum:    idx + 1,
        description: `Match ${idx + 1}: ${winnerNames.join(' & ')} beat ${loserNames.join(' & ')}`,
      },
    };
  }
}

// ── SkipMatchCommand ──────────────────────────────────────────────────────────

export class SkipMatchCommand {
  constructor(playerName) {
    this.playerName = playerName; // name of the player opting out
  }

  execute(room) {
    const idx   = room.currentMatchIndex;
    const match = room.matches[idx];
    const { playerName } = this;

    // Players on the court excluding the one who wants to skip
    const remaining = [...match.team1, ...match.team2].filter(n => n !== playerName);

    // Bench players: anyone in the room not currently in this match
    const inMatch = new Set([...match.team1, ...match.team2]);
    const bench   = room.players
      .filter(p => !inMatch.has(p.name))
      .sort((a, b) => a.gamesPlayed - b.gamesPlayed);

    if (bench.length === 0) {
      // No substitute available — skip the whole match
      const updatedMatches = [...room.matches];
      updatedMatches[idx] = { ...match, status: 'skipped', winner: null };

      const nextIdx = idx + 1;
      if (nextIdx < updatedMatches.length) {
        updatedMatches[nextIdx] = { ...updatedMatches[nextIdx], status: 'active' };
      }

      return {
        patch: {
          matches:           updatedMatches,
          currentMatchIndex: nextIdx,
        },
        logEntry: {
          type:        'match_skipped',
          matchNum:    idx + 1,
          description: `Match ${idx + 1}: ${playerName} skipped — no substitute available, match skipped`,
        },
      };
    }

    // Sub in the bench player with fewest games played
    const sub = bench[0];
    const pool = remaining.map(name => {
      const p = room.players.find(rp => rp.name === name);
      return { name, gamesPlayed: p?.gamesPlayed ?? 0 };
    });
    pool.push({ name: sub.name, gamesPlayed: sub.gamesPlayed });

    // Generate a fair 2v2 split from the 4-player pool
    const [newMatch] = generateMatches(pool, 1, match.id);

    const updatedMatches = [...room.matches];
    updatedMatches[idx] = {
      ...(newMatch ?? match),
      id:     match.id,
      status: 'active',
      winner: null,
    };

    return {
      patch: {
        matches: updatedMatches,
      },
      logEntry: {
        type:        'match_skipped',
        matchNum:    idx + 1,
        description: `Match ${idx + 1}: ${playerName} skipped — ${sub.name} substituted in`,
      },
    };
  }
}

// ── EditMatchCommand ──────────────────────────────────────────────────────────

export class EditMatchCommand {
  constructor(matchIndex, team1, team2) {
    this.matchIndex = matchIndex;
    this.team1      = team1;
    this.team2      = team2;
  }

  execute(room) {
    const { matchIndex, team1, team2 } = this;
    const match = room.matches[matchIndex];

    // Pin the edited match so it survives future regeneration
    const updatedMatches = [...room.matches];
    updatedMatches[matchIndex] = { ...match, team1, team2, pinned: true };

    // Regenerate non-pinned pending matches after this index
    const newPending = regenerateUnpinnedMatches(updatedMatches, matchIndex, room.players);

    const finalMatches = [
      ...updatedMatches.slice(0, matchIndex + 1),
      ...newPending,
    ];

    return {
      patch: {
        matches: finalMatches,
      },
      logEntry: {
        type:        'match_edited',
        matchNum:    matchIndex + 1,
        description: `Match ${matchIndex + 1} edited: ${team1.join(' & ')} vs ${team2.join(' & ')}`,
      },
    };
  }
}

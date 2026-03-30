/**
 * One player opts out of the current match.
 *
 * The skipping player is added to the unavailable queue with
 * availableFrom = currentMatchIndex + 1, so they cannot be selected
 * as a substitute for subsequent skips in the same match.
 *
 * If a bench player is available (not on court, not in the unavailable queue):
 *   — The bench player replaces the skipper; the match is regenerated in-place.
 *   — currentMatchIndex does NOT advance.
 *
 * If no bench player is available:
 *   — The skipping player is removed from their team; the match continues
 *     with fewer players (1–4 players allowed).
 *   — currentMatchIndex does NOT advance.
 */

import { generateMatches } from '../matchGen.js';
import { Command } from './Command.js';

export class SkipMatchCommand extends Command {
  /**
   * @param {string} playerName
   * @param {number} matchIndex     - which match index to skip from (defaults to currentMatchIndex)
   * @param {number} availableFrom  - match index from which the player can play again
   */
  constructor(playerName, matchIndex, availableFrom) {
    super();
    this.playerName    = playerName;
    this.matchIndex    = matchIndex;
    this.availableFrom = availableFrom;
  }

  execute(room) {
    const idx         = this.matchIndex ?? room.currentMatchIndex;
    const match       = room.matches[idx];
    const { playerName } = this;

    // Names currently unavailable for substitution in THIS match
    const currentUnavailableNames = new Set(
      (room.unavailablePlayers ?? [])
        .filter(p => p.availableFrom > idx)
        .map(p => p.name)
    );

    // Add the skipping player to the queue
    const availableFrom = this.availableFrom ?? (idx + 1);
    const newUnavailablePlayers = [
      ...(room.unavailablePlayers ?? []),
      { name: playerName, availableFrom },
    ];

    // Bench = in room, not on court, not already unavailable (and not the skipper)
    const inMatch = new Set([...match.team1, ...match.team2]);
    const bench   = room.players
      .filter(p => !inMatch.has(p.name) && !currentUnavailableNames.has(p.name))
      .sort((a, b) => a.gamesPlayed - b.gamesPlayed);

    if (bench.length === 0) {
      // No substitute — remove the skipping player from their team and continue
      const updatedMatches = [...room.matches];
      updatedMatches[idx] = {
        ...match,
        team1: match.team1.filter(n => n !== playerName),
        team2: match.team2.filter(n => n !== playerName),
      };

      return {
        patch: {
          matches:            updatedMatches,
          unavailablePlayers: newUnavailablePlayers,
        },
        logEntry: {
          type:        'player_skipped',
          matchNum:    idx + 1,
          description: `Match ${idx + 1}: ${playerName} skipped — no substitute, continuing with reduced players`,
        },
      };
    }

    // Sub in the bench player with fewest games played
    const sub  = bench[0];
    const pool = [...match.team1, ...match.team2]
      .filter(n => n !== playerName)
      .map(name => {
        const p = room.players.find(rp => rp.name === name);
        return { name, gamesPlayed: p?.gamesPlayed ?? 0 };
      });
    pool.push({ name: sub.name, gamesPlayed: sub.gamesPlayed });

    const [newMatch]     = generateMatches(pool, 1, match.id);
    const updatedMatches = [...room.matches];
    updatedMatches[idx]  = {
      ...(newMatch ?? match),
      id:     match.id,
      status: 'active',
      winner: null,
    };

    return {
      patch: {
        matches:             updatedMatches,
        unavailablePlayers:  newUnavailablePlayers,
      },
      logEntry: {
        type:        'match_skipped',
        matchNum:    idx + 1,
        description: `Match ${idx + 1}: ${playerName} skipped — ${sub.name} substituted in (available from match ${idx + 2})`,
      },
    };
  }
}

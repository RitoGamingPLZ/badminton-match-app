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
 *   — The match is marked skipped and currentMatchIndex advances.
 *   — The unavailable queue is cleaned up (all players with availableFrom <= nextIdx
 *     are released back to the available pool).
 */

import { generateMatches } from '../matchGen.js';
import { Command } from './Command.js';

export class SkipMatchCommand extends Command {
  constructor(playerName) {
    this.playerName = playerName;
  }

  execute(room) {
    const idx         = room.currentMatchIndex;
    const match       = room.matches[idx];
    const { playerName } = this;

    // Names currently unavailable for substitution in THIS match
    const currentUnavailableNames = new Set(
      (room.unavailablePlayers ?? [])
        .filter(p => p.availableFrom > idx)
        .map(p => p.name)
    );

    // Add the skipping player to the queue
    const newUnavailablePlayers = [
      ...(room.unavailablePlayers ?? []),
      { name: playerName, availableFrom: idx + 1 },
    ];

    // Bench = in room, not on court, not already unavailable (and not the skipper)
    const inMatch = new Set([...match.team1, ...match.team2]);
    const bench   = room.players
      .filter(p => !inMatch.has(p.name) && !currentUnavailableNames.has(p.name))
      .sort((a, b) => a.gamesPlayed - b.gamesPlayed);

    if (bench.length === 0) {
      // No substitute — skip the whole match and advance
      const updatedMatches = [...room.matches];
      updatedMatches[idx] = { ...match, status: 'skipped', winner: null };

      const nextIdx = idx + 1;
      if (nextIdx < updatedMatches.length) {
        updatedMatches[nextIdx] = { ...updatedMatches[nextIdx], status: 'active' };
      }

      // Release players whose sit-out period ends with this match advancing
      const unavailablePlayers = newUnavailablePlayers.filter(
        p => p.availableFrom > nextIdx
      );

      return {
        patch: {
          matches:             updatedMatches,
          currentMatchIndex:   nextIdx,
          unavailablePlayers,
        },
        logEntry: {
          type:        'match_skipped',
          matchNum:    idx + 1,
          description: `Match ${idx + 1}: ${playerName} skipped — no substitute available, match skipped`,
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

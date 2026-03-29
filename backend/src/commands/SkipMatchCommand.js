/**
 * One player opts out of the current match.
 *
 * Decides which event to emit based on bench availability:
 *   — PLAYER_SKIPPED_WITH_SUB  if a bench player can step in
 *   — MATCH_SKIPPED            if no substitute is available
 *
 * State transition (substitute selection, match regeneration, queue update)
 * is handled by applyEvent in events/applyEvent.js.
 */

import { Command } from './Command.js';
import { PLAYER_SKIPPED_WITH_SUB, MATCH_SKIPPED } from '../events/types.js';

export class SkipMatchCommand extends Command {
  constructor(playerName) {
    super();
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

    // Bench = in room, not on court, not already unavailable (and not the skipper)
    const inMatch = new Set([...match.team1, ...match.team2]);
    const bench   = room.players
      .filter(p => !inMatch.has(p.name) && !currentUnavailableNames.has(p.name))
      .sort((a, b) => a.gamesPlayed - b.gamesPlayed);

    if (bench.length === 0) {
      return {
        event: { type: MATCH_SKIPPED, matchIndex: idx, playerName },
        logEntry: {
          type:        'match_skipped',
          matchNum:    idx + 1,
          description: `Match ${idx + 1}: ${playerName} skipped — no substitute available, match skipped`,
        },
      };
    }

    const sub = bench[0];
    return {
      event: { type: PLAYER_SKIPPED_WITH_SUB, matchIndex: idx, playerName, substituteName: sub.name },
      logEntry: {
        type:        'match_skipped',
        matchNum:    idx + 1,
        description: `Match ${idx + 1}: ${playerName} skipped — ${sub.name} substituted in (available from match ${idx + 2})`,
      },
    };
  }
}

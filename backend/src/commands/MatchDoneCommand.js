/**
 * Mark the current match as done, record the winner, and advance to the next match.
 * Players who were in the unavailable queue and whose availableFrom <= nextIdx
 * are cleared (they become available again for future matches).
 */

import { Command } from './Command.js';

export class MatchDoneCommand extends Command {
  constructor(winner) {
    super();
    this.winner = winner; // 1 | 2 | null (null = advance without recording result)
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

    // Release players whose sit-out period has ended
    const unavailablePlayers = (room.unavailablePlayers ?? []).filter(
      p => p.availableFrom > nextIdx
    );

    const winnerNames = this.winner === 1 ? match.team1 : this.winner === 2 ? match.team2 : null;
    const loserNames  = this.winner === 1 ? match.team2 : this.winner === 2 ? match.team1 : null;

    return {
      patch: {
        matches:             updatedMatches,
        players:             updatedPlayers,
        currentMatchIndex:   nextIdx,
        unavailablePlayers,
      },
      logEntry: {
        type:        'match_done',
        matchNum:    idx + 1,
        description: winnerNames
          ? `Match ${idx + 1}: ${winnerNames.join(' & ')} beat ${loserNames.join(' & ')}`
          : `Match ${idx + 1}: completed`,
      },
    };
  }
}

/**
 * Mark the current match as done and record the winner.
 * Emits a MATCH_DONE event; state transition is handled by applyEvent.
 */

import { Command } from './Command.js';
import { MATCH_DONE } from '../events/types.js';

export class MatchDoneCommand extends Command {
  constructor(winner) {
    super();
    this.winner = winner; // 1 | 2
  }

  execute(room) {
    const idx   = room.currentMatchIndex;
    const match = room.matches[idx];

    const winnerNames = this.winner === 1 ? match.team1 : match.team2;
    const loserNames  = this.winner === 1 ? match.team2 : match.team1;

    return {
      event: { type: MATCH_DONE, matchIndex: idx, winner: this.winner },
      logEntry: {
        type:        'match_done',
        matchNum:    idx + 1,
        description: `Match ${idx + 1}: ${winnerNames.join(' & ')} beat ${loserNames.join(' & ')}`,
      },
    };
  }
}

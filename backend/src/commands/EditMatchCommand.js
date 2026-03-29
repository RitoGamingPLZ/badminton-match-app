/**
 * Manually edit the teams for a match.
 * Pins the edited match so it survives future regeneration.
 * Regenerates all non-pinned pending matches after the edited index.
 */

import { regenerateUnpinnedMatches } from '../matchGen.js';
import { Command } from './Command.js';

export class EditMatchCommand extends Command {
  constructor(matchIndex, team1, team2) {
    this.matchIndex = matchIndex;
    this.team1      = team1;
    this.team2      = team2;
  }

  execute(room) {
    const { matchIndex, team1, team2 } = this;
    const match = room.matches[matchIndex];

    const updatedMatches = [...room.matches];
    updatedMatches[matchIndex] = { ...match, team1, team2, pinned: true };

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

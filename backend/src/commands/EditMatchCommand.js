/**
 * Manually edit the teams for a match.
 * Emits a MATCH_EDITED event; pinning and pending-match regeneration
 * are handled by applyEvent in events/applyEvent.js.
 */

import { Command } from './Command.js';
import { MATCH_EDITED } from '../events/types.js';

export class EditMatchCommand extends Command {
  constructor(matchIndex, team1, team2) {
    super();
    this.matchIndex = matchIndex;
    this.team1      = team1;
    this.team2      = team2;
  }

  execute(room) {  // eslint-disable-line no-unused-vars
    const { matchIndex, team1, team2 } = this;

    return {
      event: { type: MATCH_EDITED, matchIndex, team1, team2 },
      logEntry: {
        type:        'match_edited',
        matchNum:    matchIndex + 1,
        description: `Match ${matchIndex + 1} edited: ${team1.join(' & ')} vs ${team2.join(' & ')}`,
      },
    };
  }
}

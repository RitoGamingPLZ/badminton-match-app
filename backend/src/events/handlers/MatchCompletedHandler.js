import { BaseEventHandler } from '../BaseEventHandler.js';

export class MatchCompletedHandler extends BaseEventHandler {
  apply(state, event) {
    const nextMatches = updateMatches(state, event);
    const nextPlayers = updatePlayers(state, event);

    return {
      ...state,
      matches: nextMatches,
      players: nextPlayers,
    };
  }
}

// NOTE: ensure these helpers are imported from your existing modules
import { updateMatches, updatePlayers } from '../../helpers.js';

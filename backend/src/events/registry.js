import { MatchCompletedHandler } from './handlers/MatchCompletedHandler.js';
import { PlayerSkippedHandler } from './handlers/PlayerSkippedHandler.js';

export const handlers = {
  MATCH_COMPLETED: new MatchCompletedHandler(),
  PLAYER_SKIPPED: new PlayerSkippedHandler(),
};

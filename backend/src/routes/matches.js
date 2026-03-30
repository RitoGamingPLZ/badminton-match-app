/**
 * Match operation route handlers.
 */

import { matchService } from '../services/index.js';
import { hostToken, wrapRoute } from './helpers.js';

export const markMatchDone = wrapRoute(req => {
  const { winner, version } = req.body || {};
  return matchService.markDone(req.params.code, hostToken(req), winner, version);
});

export const skipMatch = wrapRoute(req => {
  const { playerName, version, skipFrom } = req.body || {};
  return matchService.skipMatch(req.params.code, null, playerName, version, skipFrom);
});

export const editMatch = wrapRoute(req => {
  const { team1, team2, matchIndex, version } = req.body || {};
  return matchService.editMatch(req.params.code, hostToken(req), matchIndex, team1, team2, version);
});

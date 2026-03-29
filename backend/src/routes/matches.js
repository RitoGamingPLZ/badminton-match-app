/**
 * Match operation route handlers — parse request, delegate to MatchService, respond.
 */

import { matchService } from '../services/index.js';
import { hostToken, logRequest } from './helpers.js';

export async function handleMarkMatchDone(req, res, next) {
  try {
    const { winner, version } = req.body || {};
    const result = await matchService.markDone(req.params.code, hostToken(req), winner, version);
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}

export async function handleSkipMatch(req, res, next) {
  try {
    const { playerName, version } = req.body || {};
    const result = await matchService.skipMatch(req.params.code, hostToken(req), playerName, version);
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}

export async function handleEditMatch(req, res, next) {
  try {
    const { team1, team2, version } = req.body || {};
    const matchIndex = req.body?.matchIndex;
    const result = await matchService.editMatch(
      req.params.code, hostToken(req), matchIndex, team1, team2, version
    );
    logRequest(req.method, req.path, 200);
    res.status(200).json(result);
  } catch (e) { next(e); }
}
